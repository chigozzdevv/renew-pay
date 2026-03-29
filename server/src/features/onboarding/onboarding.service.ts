import { appendAuditLog } from "@/features/audit/audit.service";
import {
  getMerchantKybStatusByMerchantId,
  getTeamMemberKycStatusById,
  startMerchantKybSession,
  startTeamMemberKycSession,
} from "@/features/kyc/kyc.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { assertSupportedBillingMarkets } from "@/features/payment-rails/payment-rails.service";
import {
  createProtocolMerchant,
  isProtocolMerchantRegistered,
} from "@/features/protocol/protocol.merchant";
import { getOrCreateMerchantSetting } from "@/features/settings/setting.factory";
import { SettingModel } from "@/features/settings/setting.model";
import { TeamMemberModel } from "@/features/teams/team.model";
import { TreasuryAccountModel } from "@/features/treasury/treasury-account.model";
import { TreasurySignerModel } from "@/features/treasury/treasury-signer.model";
import { bootstrapTreasuryAccount } from "@/features/treasury/treasury.service";
import type {
  OnboardingBusinessInput,
  OnboardingPayoutInput,
  OnboardingRegisterInput,
  OnboardingVerificationStartInput,
} from "@/features/onboarding/onboarding.validation";
import {
  isConfiguredWalletAddress,
  normalizeSolanaAddress,
} from "@/shared/constants/solana";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";
import { createRuntimeModeCondition } from "@/shared/utils/runtime-environment";

type StepStatus = "complete" | "current" | "pending";

async function getMerchantOrThrow(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

async function getTeamMemberOrThrow(teamMemberId: string, merchantId: string) {
  const member = await TeamMemberModel.findById(teamMemberId).exec();

  if (!member || member.merchantId.toString() !== merchantId) {
    throw new HttpError(404, "Team member was not found.");
  }

  return member;
}

const getOrCreateSetting = getOrCreateMerchantSetting;

async function loadSetting(merchantId: string) {
  return SettingModel.findOne({ merchantId }).exec();
}

async function loadTreasuryAccount(merchantId: string, environment: RuntimeMode) {
  return TreasuryAccountModel.findOne({
    merchantId,
    ...createRuntimeModeCondition("environment", environment),
  }).exec();
}

async function getActiveOwnerSigner(input: {
  merchantId: string;
  teamMemberId: string;
}) {
  const signer = await TreasurySignerModel.findOne({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    status: "active",
  }).exec();

  if (!signer) {
    throw new HttpError(
      409,
      "Verify the signed-in Privy wallet before registering the workspace."
    );
  }

  return signer;
}

function assertOwnerRole(role: string) {
  if (role !== "owner") {
    throw new HttpError(
      403,
      "Only the workspace owner can finish merchant registration."
    );
  }
}

function hasOperatorTreasuryContext(
  value: Awaited<ReturnType<typeof loadTreasuryAccount>>
): value is NonNullable<Awaited<ReturnType<typeof loadTreasuryAccount>>> {
  return Boolean(
    value?.governanceMultisigAddress?.trim() &&
      value.governanceVaultAddress?.trim() &&
      value.operatorMultisigAddress?.trim() &&
      value.operatorVaultAddress?.trim()
  );
}

async function ensureOnboardingProtocolReady(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  environment: RuntimeMode;
  merchantPayoutWallet: string;
  metadataHash: string;
}) {
  const treasuryAccount =
    (await loadTreasuryAccount(input.merchantId, input.environment)) ??
    null;

  if (!hasOperatorTreasuryContext(treasuryAccount)) {
    await bootstrapTreasuryAccount({
      merchantId: input.merchantId,
      actor: input.actor,
      requesterTeamMemberId: input.teamMemberId,
      payload: {
        environment: input.environment,
        mode: "create",
        ownerTeamMemberIds: [input.teamMemberId],
        threshold: 1,
      },
    });
  }

  const readyTreasuryAccount = await loadTreasuryAccount(
    input.merchantId,
    input.environment
  );

  if (!hasOperatorTreasuryContext(readyTreasuryAccount)) {
    throw new HttpError(
      409,
      "Merchant treasury setup is incomplete. Verify the owner signer and try again."
    );
  }

  const merchantRegistered = await isProtocolMerchantRegistered(
    input.environment,
    input.merchantId
  );

  if (!merchantRegistered) {
    await createProtocolMerchant({
      environment: input.environment,
      merchantId: input.merchantId,
      payoutWallet: input.merchantPayoutWallet,
      metadataHash: input.metadataHash,
      operatorMultisigAddress: readyTreasuryAccount.operatorMultisigAddress!,
      operatorVaultAddress: readyTreasuryAccount.operatorVaultAddress!,
      operatorVaultIndex: readyTreasuryAccount.operatorVaultIndex ?? 0,
    });
  }
}

async function resolveOnboardingState(input: {
  merchantId: string;
  teamMemberId: string;
  environment: RuntimeMode;
}) {
  const [merchant, owner, setting, ownerKyc, merchantKyb] = await Promise.all([
    getMerchantOrThrow(input.merchantId),
    getTeamMemberOrThrow(input.teamMemberId, input.merchantId),
    loadSetting(input.merchantId),
    getTeamMemberKycStatusById({
      merchantId: input.merchantId,
      teamMemberId: input.teamMemberId,
      environment: input.environment,
    }),
    getMerchantKybStatusByMerchantId(input.merchantId, input.environment),
  ]);

  const businessComplete =
    typeof owner.name === "string" &&
    owner.name.trim().length > 1 &&
    typeof merchant.name === "string" &&
    merchant.name.trim().length > 1 &&
    typeof merchant.supportEmail === "string" &&
    merchant.supportEmail.trim().length > 3 &&
    merchant.supportedMarkets.length > 0;
  const ownerKycComplete = ownerKyc.status === "approved";
  const merchantKybRequired = input.environment === "live";
  const merchantKybComplete = !merchantKybRequired || merchantKyb.status === "approved";
  const verificationComplete = ownerKycComplete && merchantKybComplete;
  const payoutConfigured = isConfiguredWalletAddress(merchant.payoutWallet);

  const currentStepKey = !businessComplete
    ? "business"
    : !verificationComplete
      ? "verification"
      : !payoutConfigured
        ? "payout"
        : merchant.onboardingStatus === "workspace_active"
          ? "workspace_active"
          : "register";

  const steps = [
    {
      key: "business",
      label: "Business basics",
      status: businessComplete
        ? "complete"
        : currentStepKey === "business"
          ? "current"
          : "pending",
    },
    {
      key: "verification",
      label: "Verification",
      status: verificationComplete
        ? "complete"
        : currentStepKey === "verification"
          ? "current"
          : "pending",
    },
    {
      key: "payout",
      label: "Payout",
      status: payoutConfigured
        ? "complete"
        : currentStepKey === "payout"
          ? "current"
          : "pending",
    },
    {
      key: "register",
      label: "Register",
      status:
        merchant.onboardingStatus === "workspace_active"
          ? "complete"
          : currentStepKey === "register"
            ? "current"
            : "pending",
    },
  ];

  return {
    merchant,
    owner,
    setting,
    ownerKyc,
    merchantKyb,
    canComplete: businessComplete && verificationComplete && payoutConfigured,
    currentStepKey,
    steps,
    status:
      merchant.onboardingStatus === "workspace_active"
        ? "workspace_active"
        : currentStepKey,
  };
}

function toOnboardingResponse(input: Awaited<ReturnType<typeof resolveOnboardingState>> & {
  environment: RuntimeMode;
}) {
  return {
    merchantId: input.merchant._id.toString(),
    teamMemberId: input.owner._id.toString(),
    environment: input.environment,
    status: input.status,
    canComplete: input.canComplete,
    currentStepKey: input.currentStepKey,
    steps: input.steps,
    business: {
      logoUrl: input.setting?.business.logoUrl ?? "",
      ownerName: input.owner.name ?? "",
      name: input.merchant.name ?? "",
      supportEmail: input.merchant.supportEmail ?? "",
      supportedMarkets: input.merchant.supportedMarkets,
    },
    verification: {
      ownerKyc: input.ownerKyc,
      merchantKyb: input.merchantKyb,
      required: {
        ownerKyc: true,
        merchantKyb: input.environment === "live",
      },
    },
    payout: {
      payoutWallet: input.merchant.payoutWallet ?? "",
      payoutConfigured: isConfiguredWalletAddress(input.merchant.payoutWallet),
      bankTransferStatus: "coming_soon" as const,
    },
  };
}

async function persistIntermediateOnboardingStatus(input: {
  merchantId: string;
  environment: RuntimeMode;
  teamMemberId: string;
}) {
  const state = await resolveOnboardingState(input);
  const nextStatus =
    state.status === "workspace_active" ? "workspace_active" : state.currentStepKey;

  if (state.merchant.onboardingStatus !== nextStatus) {
    state.merchant.onboardingStatus = nextStatus;
    await state.merchant.save();
  }

  return toOnboardingResponse({
    ...state,
    environment: input.environment,
  });
}

export async function getOnboardingState(input: {
  merchantId: string;
  teamMemberId: string;
  environment: RuntimeMode;
}) {
  const state = await resolveOnboardingState(input);

  return toOnboardingResponse({
    ...state,
    environment: input.environment,
  });
}

export async function saveOnboardingBusiness(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  payload: OnboardingBusinessInput;
}) {
  await assertSupportedBillingMarkets({
    markets: input.payload.supportedMarkets,
    environment: input.payload.environment,
  });

  const [merchant, owner, setting] = await Promise.all([
    getMerchantOrThrow(input.merchantId),
    getTeamMemberOrThrow(input.teamMemberId, input.merchantId),
    getOrCreateSetting(input.merchantId),
  ]);

  owner.name = input.payload.ownerName;
  owner.markets = input.payload.supportedMarkets;
  merchant.name = input.payload.name;
  merchant.supportEmail = input.payload.supportEmail;
  merchant.supportedMarkets = input.payload.supportedMarkets;
  setting.business.name = input.payload.name;
  setting.business.supportEmail = input.payload.supportEmail;
  setting.business.logoUrl = input.payload.logoUrl?.trim()
    ? input.payload.logoUrl.trim()
    : null;
  setting.business.defaultMarket = input.payload.supportedMarkets[0] ?? "NGN";
  merchant.billingTimezone = merchant.billingTimezone?.trim() ? merchant.billingTimezone : "UTC";
  setting.business.billingTimezone = setting.business.billingTimezone?.trim()
    ? setting.business.billingTimezone
    : "UTC";

  await Promise.all([owner.save(), merchant.save(), setting.save()]);

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Updated onboarding business details",
    category: "workspace",
    status: "ok",
    target: input.payload.supportEmail,
    detail: "Business basics were updated during onboarding.",
    metadata: {
      supportedMarkets: input.payload.supportedMarkets,
      defaultMarket: setting.business.defaultMarket,
      logoUrl: setting.business.logoUrl,
    },
    ipAddress: null,
    userAgent: null,
  });

  return persistIntermediateOnboardingStatus({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    environment: input.payload.environment,
  });
}

export async function startOnboardingVerification(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  payload: OnboardingVerificationStartInput;
}) {
  const [merchant, owner] = await Promise.all([
    getMerchantOrThrow(input.merchantId),
    getTeamMemberOrThrow(input.teamMemberId, input.merchantId),
  ]);

  const hasBusinessBasics =
    typeof owner.name === "string" &&
    owner.name.trim().length > 1 &&
    typeof merchant.name === "string" &&
    merchant.name.trim().length > 1 &&
    typeof merchant.supportEmail === "string" &&
    merchant.supportEmail.trim().length > 3 &&
    merchant.supportedMarkets.length > 0;

  if (!hasBusinessBasics) {
    throw new HttpError(409, "Save business details before starting verification.");
  }

  const subject =
    input.payload.subject ??
    (input.payload.environment === "live" ? "owner_kyc" : "owner_kyc");

  if (subject === "merchant_kyb") {
    return startMerchantKybSession({
      merchantId: input.merchantId,
      actor: input.actor,
      environment: input.payload.environment,
      companyName: merchant.name ?? undefined,
      registrationNumber: input.payload.registrationNumber,
      country: input.payload.country,
      taxId: input.payload.taxId,
      lang: input.payload.lang,
    });
  }

  return startTeamMemberKycSession({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    actor: input.actor,
    environment: input.payload.environment,
    country: input.payload.country,
    lang: input.payload.lang,
  });
}

export async function saveOnboardingPayout(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  payload: OnboardingPayoutInput;
}) {
  const [merchant, setting] = await Promise.all([
    getMerchantOrThrow(input.merchantId),
    getOrCreateSetting(input.merchantId),
  ]);

  const payoutWallet = normalizeSolanaAddress(input.payload.payoutWallet);

  if (!payoutWallet) {
    throw new HttpError(400, "Payout wallet is invalid.");
  }

  merchant.payoutWallet = payoutWallet;
  setting.wallets.primaryWallet = payoutWallet;
  await Promise.all([merchant.save(), setting.save()]);

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Configured onboarding payout wallet",
    category: "treasury",
    status: "ok",
    target: input.payload.payoutWallet,
    detail: "Payout wallet was configured during onboarding.",
    metadata: {
      payoutWallet,
    },
    ipAddress: null,
    userAgent: null,
  });

  return persistIntermediateOnboardingStatus({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    environment: input.payload.environment,
  });
}

export async function registerOnboardingMerchant(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  payload: OnboardingRegisterInput;
}) {
  const state = await resolveOnboardingState({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    environment: input.payload.environment,
  });

  if (!state.canComplete) {
    throw new HttpError(409, "Onboarding is still missing required steps.");
  }

  assertOwnerRole(state.owner.role);

  const activeSigner = await getActiveOwnerSigner({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
  });
  const merchantPayoutWallet = state.merchant.payoutWallet;

  if (!merchantPayoutWallet) {
    throw new HttpError(409, "Configure a payout wallet before registering the workspace.");
  }

  await ensureOnboardingProtocolReady({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    actor: input.actor,
    environment: input.payload.environment,
    merchantPayoutWallet,
    metadataHash: state.merchant.metadataHash,
  });

  state.merchant.operatorWalletAddress = activeSigner.walletAddress;
  state.merchant.governanceEnabled = true;
  state.merchant.onboardingStatus = "workspace_active";
  await state.merchant.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Registered merchant workspace",
    category: "workspace",
    status: "ok",
    target: state.merchant.name ?? state.merchant.supportEmail ?? null,
    detail:
      "Merchant registration completed and the initial 1-of-1 signer/governance context was created.",
    metadata: {
      environment: input.payload.environment,
      governanceEnabled: true,
      signerWallet: activeSigner.walletAddress,
    },
    ipAddress: null,
    userAgent: null,
  });

  return getOnboardingState({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    environment: input.payload.environment,
  });
}
