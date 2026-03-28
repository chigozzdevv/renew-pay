import { appendAuditLog } from "@/features/audit/audit.service";
import {
  getMerchantKybStatusByMerchantId,
  getTeamMemberKycStatusById,
  startMerchantKybSession,
  startTeamMemberKycSession,
} from "@/features/kyc/kyc.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { getOrCreateMerchantSetting } from "@/features/settings/setting.factory";
import { TeamMemberModel } from "@/features/teams/team.model";
import type {
  OnboardingBusinessProfileInput,
  OnboardingCompleteInput,
  OnboardingGovernanceInput,
  OnboardingPayoutSettingsInput,
  OnboardingVerificationStartInput,
} from "@/features/onboarding/onboarding.validation";
import {
  isConfiguredWalletAddress,
  normalizeSolanaAddress,
} from "@/shared/constants/solana";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

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

async function resolveOnboardingState(input: {
  merchantId: string;
  teamMemberId: string;
  environment: RuntimeMode;
}) {
  const [merchant, owner, setting, ownerKyc, merchantKyb] = await Promise.all([
    getMerchantOrThrow(input.merchantId),
    getTeamMemberOrThrow(input.teamMemberId, input.merchantId),
    getOrCreateSetting(input.merchantId),
    getTeamMemberKycStatusById({
      merchantId: input.merchantId,
      teamMemberId: input.teamMemberId,
      environment: input.environment,
    }),
    getMerchantKybStatusByMerchantId(input.merchantId, input.environment),
  ]);

  const businessProfileComplete =
    merchant.name.trim().length > 1 &&
    merchant.supportEmail.trim().length > 3 &&
    merchant.billingTimezone.trim().length > 1 &&
    merchant.supportedMarkets.length > 0;
  const ownerKycComplete = ownerKyc.status === "approved";
  const merchantKybRequired = input.environment === "live";
  const merchantKybComplete = !merchantKybRequired || merchantKyb.status === "approved";
  const verificationComplete = ownerKycComplete && merchantKybComplete;
  const payoutConfigured = isConfiguredWalletAddress(merchant.payoutWallet);

  const currentStepKey = !businessProfileComplete
    ? "business_basics"
    : !verificationComplete
      ? "verification"
      : !payoutConfigured
        ? "payout_setup"
        : merchant.onboardingStatus === "workspace_active"
          ? "workspace_active"
          : "governance_optional";

  const steps = [
    { key: "identity_complete", label: "Identity", status: "complete" as StepStatus },
    {
      key: "business_basics",
      label: "Business basics",
      status: businessProfileComplete
        ? "complete"
        : currentStepKey === "business_basics"
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
      key: "payout_setup",
      label: "Payout setup",
      status: payoutConfigured
        ? "complete"
        : currentStepKey === "payout_setup"
          ? "current"
          : "pending",
    },
    {
      key: "governance_optional",
      label: "Advanced governance",
      status:
        merchant.onboardingStatus === "workspace_active"
          ? "complete"
          : currentStepKey === "governance_optional"
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
    canComplete: businessProfileComplete && verificationComplete && payoutConfigured,
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
    businessProfile: {
      businessName: input.merchant.name,
      supportEmail: input.merchant.supportEmail,
      billingTimezone: input.merchant.billingTimezone,
      supportedMarkets: input.merchant.supportedMarkets,
      defaultMarket: input.setting.defaultMarket,
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
      payoutWallet: input.merchant.payoutWallet,
      payoutConfigured: isConfiguredWalletAddress(input.merchant.payoutWallet),
      payoutMode: input.setting.payoutMode,
      autoPayoutFrequency: input.setting.autoPayoutFrequency,
      autoPayoutTimeLocal: input.setting.autoPayoutTimeLocal,
      thresholdPayoutEnabled: input.setting.thresholdPayoutEnabled,
      autoPayoutThresholdUsdc: input.setting.autoPayoutThresholdUsdc,
    },
    governance: {
      enabled: true,
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

export async function updateOnboardingBusinessProfile(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  payload: OnboardingBusinessProfileInput;
}) {
  const [merchant, setting] = await Promise.all([
    getMerchantOrThrow(input.merchantId),
    getOrCreateSetting(input.merchantId),
  ]);

  merchant.name = input.payload.businessName;
  merchant.supportEmail = input.payload.supportEmail;
  merchant.billingTimezone = input.payload.billingTimezone;
  merchant.supportedMarkets = input.payload.supportedMarkets;
  setting.businessName = input.payload.businessName;
  setting.supportEmail = input.payload.supportEmail;
  setting.billingTimezone = input.payload.billingTimezone;
  setting.defaultMarket =
    input.payload.defaultMarket && input.payload.supportedMarkets.includes(input.payload.defaultMarket)
      ? input.payload.defaultMarket
      : input.payload.supportedMarkets[0] ?? "NGN";

  await Promise.all([merchant.save(), setting.save()]);

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Updated onboarding business profile",
    category: "workspace",
    status: "ok",
    target: input.payload.supportEmail,
    detail: "Business profile was updated during onboarding.",
    metadata: {
      supportedMarkets: input.payload.supportedMarkets,
      defaultMarket: setting.defaultMarket,
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
  const subject =
    input.payload.subject ??
    (input.payload.environment === "live" ? "owner_kyc" : "owner_kyc");

  if (subject === "merchant_kyb") {
    const merchant = await getMerchantOrThrow(input.merchantId);
    return startMerchantKybSession({
      merchantId: input.merchantId,
      actor: input.actor,
      environment: input.payload.environment,
      companyName: merchant.name,
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

export async function updateOnboardingPayoutSettings(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  payload: OnboardingPayoutSettingsInput;
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
  setting.primaryWallet = payoutWallet;
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

export async function updateOnboardingGovernance(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  payload: OnboardingGovernanceInput;
}) {
  const merchant = await getMerchantOrThrow(input.merchantId);
  merchant.governanceEnabled = true;
  await merchant.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Configured workspace approvals",
    category: "security",
    status: "ok",
    target: merchant.name,
    detail:
      "Workspace approvals stay enabled; multi-owner workspaces automatically use multisig.",
    metadata: {
      governanceEnabled: true,
      requestedEnabled: input.payload.enabled,
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

export async function completeOnboarding(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  payload: OnboardingCompleteInput;
}) {
  const state = await resolveOnboardingState({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    environment: input.payload.environment,
  });

  if (!state.canComplete) {
    throw new HttpError(409, "Onboarding is still missing required steps.");
  }

  state.merchant.onboardingStatus = "workspace_active";
  await state.merchant.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Completed onboarding",
    category: "workspace",
    status: "ok",
    target: state.merchant.name,
    detail: "Workspace onboarding was completed.",
    metadata: {
      environment: input.payload.environment,
      governanceEnabled: true,
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
