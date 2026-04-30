import { appendAuditLog } from "@/features/audit/audit.service";
import {
  getMerchantKybStatusByMerchantId,
  getOwnerKycStatusByMerchantId,
  startMerchantKybSession,
  startOwnerKycSession,
} from "@/features/kyc/kyc.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { assertSupportedCollectionMarkets } from "@/features/onramps/onramp.service";
import { getOrCreateMerchantSetting } from "@/features/settings/setting.factory";
import { SettingModel } from "@/features/settings/setting.model";
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

function assertTestOnboardingOnly(environment: RuntimeMode) {
  if (environment === "live") {
    throw new HttpError(409, "Live onboarding is coming soon. Use test onboarding for now.");
  }
}

async function getMerchantOrThrow(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

const getOrCreateSetting = getOrCreateMerchantSetting;

async function loadSetting(merchantId: string) {
  return SettingModel.findOne({ merchantId }).exec();
}

async function resolveOnboardingState(input: {
  merchantId: string;
  environment: RuntimeMode;
}) {
  const [merchant, setting, ownerKyc, merchantKyb] = await Promise.all([
    getMerchantOrThrow(input.merchantId),
    loadSetting(input.merchantId),
    getOwnerKycStatusByMerchantId({
      merchantId: input.merchantId,
      environment: input.environment,
    }),
    getMerchantKybStatusByMerchantId(input.merchantId, input.environment),
  ]);

  const businessComplete =
    typeof merchant.ownerName === "string" &&
    merchant.ownerName.trim().length > 1 &&
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
  const merchantId = input.merchant._id.toString();

  return {
    merchantId,
    accountId: merchantId,
    environment: input.environment,
    status: input.status,
    canComplete: input.canComplete,
    currentStepKey: input.currentStepKey,
    steps: input.steps,
    business: {
      logoUrl: input.setting?.business.logoUrl ?? "",
      ownerName: input.merchant.ownerName ?? "",
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
  environment: RuntimeMode;
}) {
  assertTestOnboardingOnly(input.environment);

  const state = await resolveOnboardingState(input);

  return toOnboardingResponse({
    ...state,
    environment: input.environment,
  });
}

export async function saveOnboardingBusiness(input: {
  merchantId: string;
  actor: string;
  payload: OnboardingBusinessInput;
}) {
  assertTestOnboardingOnly(input.payload.environment);

  await assertSupportedCollectionMarkets({
    markets: input.payload.supportedMarkets,
    environment: input.payload.environment,
  });

  const [merchant, existingSetting] = await Promise.all([
    getMerchantOrThrow(input.merchantId),
    loadSetting(input.merchantId),
  ]);

  merchant.ownerName = input.payload.ownerName;
  merchant.name = input.payload.name;
  merchant.supportEmail = input.payload.supportEmail;
  merchant.supportedMarkets = input.payload.supportedMarkets;
  merchant.timezone = merchant.timezone?.trim()
    ? merchant.timezone
    : "UTC";

  await merchant.save();

  const setting = existingSetting ?? (await getOrCreateSetting(input.merchantId));

  setting.business.name = input.payload.name;
  setting.business.supportEmail = input.payload.supportEmail;
  setting.business.logoUrl = input.payload.logoUrl?.trim()
    ? input.payload.logoUrl.trim()
    : null;
  setting.business.defaultMarket = input.payload.supportedMarkets[0] ?? "NGN";
  setting.business.timezone = setting.business.timezone?.trim()
    ? setting.business.timezone
    : "UTC";

  await setting.save();

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
    environment: input.payload.environment,
  });
}

export async function startOnboardingVerification(input: {
  merchantId: string;
  actor: string;
  payload: OnboardingVerificationStartInput;
}) {
  assertTestOnboardingOnly(input.payload.environment);

  const merchant = await getMerchantOrThrow(input.merchantId);
  const hasBusinessBasics =
    typeof merchant.ownerName === "string" &&
    merchant.ownerName.trim().length > 1 &&
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

  return startOwnerKycSession({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.payload.environment,
    country: input.payload.country,
    lang: input.payload.lang,
  });
}

export async function saveOnboardingPayout(input: {
  merchantId: string;
  actor: string;
  payload: OnboardingPayoutInput;
}) {
  assertTestOnboardingOnly(input.payload.environment);

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
    category: "workspace",
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
    environment: input.payload.environment,
  });
}

export async function registerOnboardingMerchant(input: {
  merchantId: string;
  actor: string;
  payload: OnboardingRegisterInput;
}) {
  assertTestOnboardingOnly(input.payload.environment);

  const state = await resolveOnboardingState({
    merchantId: input.merchantId,
    environment: input.payload.environment,
  });

  if (!state.canComplete) {
    throw new HttpError(409, "Onboarding is still missing required steps.");
  }

  const merchantPayoutWallet = state.merchant.payoutWallet;

  if (!merchantPayoutWallet) {
    throw new HttpError(409, "Configure a payout wallet before registering the workspace.");
  }

  state.merchant.onboardingStatus = "workspace_active";
  await state.merchant.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Registered merchant workspace",
    category: "workspace",
    status: "ok",
    target: state.merchant.name ?? state.merchant.supportEmail ?? null,
    detail: "Merchant registration completed.",
    metadata: {
      environment: input.payload.environment,
      payoutWallet: merchantPayoutWallet,
    },
    ipAddress: null,
    userAgent: null,
  });

  return getOnboardingState({
    merchantId: input.merchantId,
    environment: input.payload.environment,
  });
}
