import { createHash, randomBytes } from "crypto";

import { HttpError } from "@/shared/errors/http-error";

import { getDefaultPaymentRailProvider } from "@/config/payment-rail.config";
import { ChargeModel, type ChargeDocument } from "@/features/charges/charge.model";
import { CheckoutSessionModel } from "@/features/checkout/checkout-session.model";
import type {
  CreateCheckoutSessionInput,
  SubmitCheckoutCustomerInput,
  SubmitCheckoutVerificationInput,
} from "@/features/checkout/checkout.validation";
import { CustomerModel } from "@/features/customers/customer.model";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { queueSubscriptionCreatedNotifications } from "@/features/notifications/notification.service";
import {
  acceptCollectionRequest,
  createCollectionRequest,
  getPreferredCollectionChannel,
  getPreferredCollectionNetwork,
  processYellowCardWebhook,
  quoteUsdAmountInBillingCurrency,
} from "@/features/payment-rails/payment-rails.service";
import {
  buildPartnaMethodVerificationSnapshot,
  buildPartnaPhoneVerificationSnapshot,
  buildPartnaOtpVerificationSnapshot,
  buildPartnaVerificationSnapshot,
  completePartnaCustomerPaymentProfileVerification,
  continuePartnaCustomerPaymentProfileVerificationAfterMethod,
  continuePartnaCustomerPaymentProfileVerificationAfterPhone,
  hasActivePartnaPaymentProfile,
  processPartnaWebhook,
  startPartnaCustomerPaymentProfileVerification,
} from "@/features/payment-rails/partna.service";
import { getPartnaProvider } from "@/features/payment-rails/providers/partna/partna.factory";
import { PlanModel } from "@/features/plans/plan.model";
import {
  createSettlement,
  queueSettlementBridge,
} from "@/features/settlements/settlement.service";
import {
  SettlementModel,
  type SettlementDocument,
} from "@/features/settlements/settlement.model";
import { SubscriptionModel } from "@/features/subscriptions/subscription.model";
import {
  getTreasuryByMerchantId,
  ensureMerchantSubscriptionOperatorReady,
  queueSubscriptionProtocolCreate,
  queueSubscriptionProtocolResume,
} from "@/features/treasury/treasury.service";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import {
  createRuntimeModeCondition,
  toPublicEnvironment,
} from "@/shared/utils/runtime-environment";
import { Types } from "mongoose";

type CheckoutContext = {
  developerKeyId?: string | null;
  merchantId: string;
  environment: RuntimeMode;
  label: string;
};

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createClientSecret() {
  const token = `rcs_${randomBytes(24).toString("hex")}`;

  return {
    token,
    hash: hashSecret(token),
  };
}

function buildCustomerRef(email: string) {
  const normalized = email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const suffix = randomBytes(4).toString("hex");
  return `cust_${normalized.slice(0, 24).replace(/^-+|-+$/g, "") || "customer"}_${suffix}`;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMilliseconds(date: Date, milliseconds: number) {
  return new Date(date.getTime() + milliseconds);
}

async function waitForTimestamp(value: Date | null | undefined) {
  if (!(value instanceof Date)) {
    return;
  }

  const remainingMs = value.getTime() - Date.now();

  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs + 250));
  }
}

function deriveSessionStatus(input: {
  currentStatus: string;
  expiresAt: Date;
  hasSubscription: boolean;
  chargeStatus?: string | null;
  settlementStatus?: string | null;
}) {
  const now = Date.now();
  const isExpired = input.expiresAt.getTime() <= now;
  const chargeStatus = input.chargeStatus ?? null;
  const settlementStatus = input.settlementStatus ?? null;

  if (
    input.currentStatus === "pending_verification" &&
    !input.hasSubscription &&
    !chargeStatus &&
    !settlementStatus
  ) {
    return "pending_verification";
  }

  if (chargeStatus === "settled" || settlementStatus === "settled") {
    return "settled";
  }

  if (
    chargeStatus === "failed" ||
    settlementStatus === "failed" ||
    settlementStatus === "reversed"
  ) {
    return "failed";
  }

  if (
    chargeStatus === "awaiting_settlement" ||
    settlementStatus === "confirming" ||
    settlementStatus === "awaiting_approval"
  ) {
    return "processing";
  }

  if (chargeStatus === "pending" || settlementStatus === "queued") {
    return "pending_payment";
  }

  if (input.hasSubscription) {
    return "scheduled";
  }

  if (isExpired && input.currentStatus !== "settled") {
    return "expired";
  }

  return "open";
}

function deriveNextAction(input: {
  status: string;
  environment: RuntimeMode;
  hasCharge: boolean;
  paymentKind?: string | null;
}) {
  if (input.status === "open") {
    return "submit_customer";
  }

  if (input.status === "pending_verification") {
    return "complete_verification";
  }

  if (input.status === "scheduled") {
    return "wait_for_charge";
  }

  if (input.status === "pending_payment") {
    return input.environment === "test" && input.hasCharge
      ? "complete_test_payment"
      : input.paymentKind === "redirect"
        ? "redirect_to_provider"
        : "show_payment_instructions";
  }

  if (input.status === "processing") {
    return "wait_for_settlement";
  }

  return "none";
}

function toNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

async function ensureCheckoutSession(sessionId: string) {
  const session = await CheckoutSessionModel.findById(sessionId).exec();

  if (!session) {
    throw new HttpError(404, "Checkout session was not found.");
  }

  return session;
}

async function ensurePlanForCheckout(
  planId: string,
  merchantId: string,
  environment: RuntimeMode
) {
  const plan = await PlanModel.findOne({
    _id: planId,
    merchantId,
    ...createRuntimeModeCondition("environment", environment),
  }).exec();

  if (!plan) {
    throw new HttpError(404, "Plan was not found.");
  }

  if (plan.status !== "active") {
    throw new HttpError(409, "Plan is not active.");
  }

  if (!plan.protocolPlanId || plan.protocolSyncStatus !== "synced") {
    throw new HttpError(409, "Plan is not active on-chain.");
  }

  return plan;
}

async function ensureMerchantForCheckout(
  merchantId: string,
  environment: RuntimeMode
) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  if (merchant.status !== "active") {
    throw new HttpError(409, "Merchant is not active.");
  }

  return merchant;
}

async function upsertCheckoutCustomer(
  merchantId: string,
  environment: RuntimeMode,
  input: SubmitCheckoutCustomerInput
) {
  const existing = await CustomerModel.findOne({
    merchantId,
    ...createRuntimeModeCondition("environment", environment),
    email: input.email.trim().toLowerCase(),
  }).exec();

  if (existing) {
    if (existing.status === "blacklisted") {
      throw new HttpError(409, "Customer is blacklisted.");
    }

    existing.name = input.name;
    existing.market = input.market;
    existing.metadata = {
      ...(existing.metadata ?? {}),
      ...(input.metadata ?? {}),
    };
    await existing.save();
    return existing;
  }

  return CustomerModel.create({
    merchantId,
    environment,
    customerRef: buildCustomerRef(input.email),
    name: input.name,
    email: input.email,
    market: input.market,
    status: "active",
    billingState: "healthy",
    paymentMethodState: "ok",
    subscriptionCount: 0,
    monthlyVolumeUsdc: 0,
    nextRenewalAt: null,
    lastChargeAt: null,
    autoReminderEnabled: true,
    metadata: input.metadata ?? {},
  });
}

async function syncCheckoutSessionDocument(sessionId: string) {
  const session = await ensureCheckoutSession(sessionId);
  const [charge, settlement] = await Promise.all([
    session.chargeId ? ChargeModel.findById(session.chargeId).exec() : Promise.resolve(null),
    session.settlementId
      ? SettlementModel.findById(session.settlementId).exec()
      : Promise.resolve(null),
  ]);

  const nextStatus = deriveSessionStatus({
    currentStatus: session.status,
    expiresAt: session.expiresAt,
    hasSubscription: Boolean(session.subscriptionId),
    chargeStatus: charge?.status ?? null,
    settlementStatus: settlement?.status ?? null,
  });

  session.status = nextStatus;
  session.failureReason =
    charge?.failureCode ??
    (settlement && settlement.status === "failed" ? "settlement_failed" : null);

  if (charge && session.paymentSnapshot) {
    session.paymentSnapshot.status = charge.status;
  }

  if (nextStatus === "settled" && !session.completedAt) {
    session.completedAt = new Date();
  }

  if (nextStatus === "expired" && session.status !== "settled") {
    session.completedAt = session.completedAt ?? new Date();
  }

  await session.save();

  return {
    session,
    charge,
    settlement,
  };
}

function toCheckoutSessionResponse(input: {
  session: Awaited<ReturnType<typeof ensureCheckoutSession>>;
  charge?: ChargeDocument | null;
  settlement?: SettlementDocument | null;
}) {
  const { session, charge, settlement } = input;
  const runtimeEnvironment = session.environment === "live" ? "live" : "test";
  const environment = toPublicEnvironment(runtimeEnvironment);
  const planSnapshot = session.planSnapshot;
  const supportedMarkets = Array.isArray(planSnapshot.supportedMarkets)
    ? [...planSnapshot.supportedMarkets]
    : [];

  return {
    id: session._id.toString(),
    environment,
    status: session.status,
    expiresAt: session.expiresAt,
    submittedAt: session.submittedAt ?? null,
    completedAt: session.completedAt ?? null,
    nextAction: deriveNextAction({
      status: session.status,
      environment: runtimeEnvironment,
      hasCharge: Boolean(session.chargeId),
      paymentKind: session.paymentSnapshot?.kind ?? null,
    }),
    plan: {
      id: session.planId.toString(),
      planCode: planSnapshot.planCode,
      name: planSnapshot.name,
      usdAmount: planSnapshot.usdAmount,
      billingIntervalDays: planSnapshot.billingIntervalDays,
      trialDays: planSnapshot.trialDays,
      retryWindowHours: planSnapshot.retryWindowHours,
      billingMode: planSnapshot.billingMode,
      supportedMarkets,
    },
    customer:
      session.customerDraft && session.customerDraft.email
        ? {
          name: session.customerDraft.name,
          email: session.customerDraft.email,
          market: session.customerDraft.market,
        }
        : null,
    verification: session.verificationSnapshot
      ? {
        provider:
          session.verificationSnapshot.provider === "partna" ||
          session.verificationSnapshot.provider === "yellow_card"
            ? session.verificationSnapshot.provider
            : null,
        status: session.verificationSnapshot.status ?? null,
        country: session.verificationSnapshot.country ?? null,
        currency: session.verificationSnapshot.currency ?? null,
        instructions: session.verificationSnapshot.instructions ?? null,
        verificationHint: session.verificationSnapshot.verificationHint ?? null,
        verificationMethods: Array.isArray(session.verificationSnapshot.verificationMethods)
          ? session.verificationSnapshot.verificationMethods.map((entry) => ({
              method: entry?.method ?? "",
              hint: entry?.hint ?? null,
            }))
          : [],
        requiredFields: Array.isArray(session.verificationSnapshot.requiredFields)
          ? session.verificationSnapshot.requiredFields
          : [],
      }
      : null,
    charge: charge
      ? {
        id: charge._id.toString(),
        externalChargeId: charge.externalChargeId,
        status: charge.status,
        localAmount: charge.localAmount,
        usdcAmount: charge.usdcAmount,
        feeAmount: charge.feeAmount,
        failureCode: charge.failureCode ?? null,
        processedAt: charge.processedAt,
      }
      : null,
    settlement: settlement
      ? {
        id: settlement._id.toString(),
        status: settlement.status,
        netUsdc: settlement.netUsdc,
        grossUsdc: settlement.grossUsdc,
        destinationWallet: settlement.destinationWallet,
        bridgeSourceTxHash: settlement.bridgeSourceTxHash ?? null,
        bridgeReceiveTxHash: settlement.bridgeReceiveTxHash ?? null,
        creditTxHash: settlement.creditTxHash ?? null,
      }
      : null,
    paymentInstructions: session.paymentSnapshot
      ? {
        provider:
          session.paymentSnapshot.provider === "partna" ||
          session.paymentSnapshot.provider === "yellow_card"
            ? session.paymentSnapshot.provider
            : null,
        kind:
          session.paymentSnapshot.kind === "bank_transfer" ||
          session.paymentSnapshot.kind === "redirect"
            ? session.paymentSnapshot.kind
            : null,
        externalChargeId: session.paymentSnapshot.externalChargeId,
        billingCurrency: session.paymentSnapshot.billingCurrency,
        localAmount: session.paymentSnapshot.localAmount,
        usdcAmount: session.paymentSnapshot.usdcAmount,
        feeAmount: session.paymentSnapshot.feeAmount,
        status: session.paymentSnapshot.status,
        reference: session.paymentSnapshot.reference,
        expiresAt: session.paymentSnapshot.expiresAt,
        redirectUrl: session.paymentSnapshot.redirectUrl ?? null,
        bankTransfer: session.paymentSnapshot.bankTransfer
          ? {
            bankCode: session.paymentSnapshot.bankTransfer.bankCode,
            bankName: session.paymentSnapshot.bankTransfer.bankName,
            accountNumber: session.paymentSnapshot.bankTransfer.accountNumber,
            accountName: session.paymentSnapshot.bankTransfer.accountName,
            currency: session.paymentSnapshot.bankTransfer.currency,
          }
          : null,
      }
      : null,
    failureReason: session.failureReason ?? null,
    testMode: {
      enabled: runtimeEnvironment === "test",
      canCompletePayment:
        runtimeEnvironment === "test" &&
        (session.status === "pending_payment" || session.status === "processing"),
    },
  };
}

export async function listCheckoutPlans(context: CheckoutContext) {
  await ensureMerchantForCheckout(context.merchantId, context.environment);

  const plans = await PlanModel.find({
    merchantId: context.merchantId,
    ...createRuntimeModeCondition("environment", context.environment),
    status: "active",
    protocolSyncStatus: "synced",
  })
    .sort({ createdAt: -1 })
    .exec();

  return plans.map((plan) => ({
    id: plan._id.toString(),
    planCode: plan.planCode,
    name: plan.name,
    usdAmount: plan.usdAmount,
    usageRate: plan.usageRate ?? null,
    billingIntervalDays: plan.billingIntervalDays,
    trialDays: plan.trialDays,
    retryWindowHours: plan.retryWindowHours,
    billingMode: plan.billingMode,
    supportedMarkets: plan.supportedMarkets,
  }));
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
  context: CheckoutContext
) {
  await ensureMerchantForCheckout(context.merchantId, context.environment);
  const operatorReadiness = await ensureMerchantSubscriptionOperatorReady({
    merchantId: context.merchantId,
    actor: context.label,
    environment: context.environment,
  });

  if (!operatorReadiness.ready) {
    throw new HttpError(
      409,
      operatorReadiness.merchantReady
        ? "Merchant billing execution is not ready for automated checkout."
        : "Merchant treasury and protocol account are not ready for automated checkout."
    );
  }

  const plan = await ensurePlanForCheckout(
    input.planId,
    context.merchantId,
    context.environment
  );
  const token = createClientSecret();

  const session = await CheckoutSessionModel.create({
    merchantId: context.merchantId,
    developerKeyId: context.developerKeyId ?? null,
    planId: plan._id,
    environment: context.environment,
    status: "open",
    clientTokenHash: token.hash,
    planSnapshot: {
      planCode: plan.planCode,
      name: plan.name,
      usdAmount: plan.usdAmount,
      billingIntervalDays: plan.billingIntervalDays,
      trialDays: plan.trialDays,
      retryWindowHours: plan.retryWindowHours,
      billingMode: plan.billingMode,
      supportedMarkets: plan.supportedMarkets,
    },
    expiresAt: new Date(Date.now() + input.expiresInMinutes * 60 * 1000),
    metadata: input.metadata ?? {},
  });

  return {
    clientSecret: token.token,
    session: toCheckoutSessionResponse({ session }),
  };
}

export async function getCheckoutSession(sessionId: string) {
  const hydrated = await syncCheckoutSessionDocument(sessionId);

  return toCheckoutSessionResponse(hydrated);
}

async function activateCheckoutSubscription(input: {
  sessionId: string;
  session: Awaited<ReturnType<typeof ensureCheckoutSession>>;
  merchant: Awaited<ReturnType<typeof ensureMerchantForCheckout>>;
  plan: Awaited<ReturnType<typeof ensurePlanForCheckout>>;
  customer: Awaited<ReturnType<typeof upsertCheckoutCustomer>>;
  runtimeEnvironment: RuntimeMode;
}) {
  const initialQuote = await quoteUsdAmountInBillingCurrency({
    environment: input.runtimeEnvironment,
    currency: input.customer.market,
    usdAmount: input.plan.usdAmount,
  });
  const nextChargeAt =
    input.plan.trialDays > 0 ? addDays(new Date(), input.plan.trialDays) : new Date();
  const paymentProvider = getDefaultPaymentRailProvider(input.runtimeEnvironment);
  const paymentProfile =
    paymentProvider === "partna" ? input.customer.paymentProfile ?? null : null;
  const partnaBankTransfer = paymentProfile?.bankTransfer ?? null;

  const subscription = await SubscriptionModel.create({
    merchantId: input.merchant._id,
    environment: input.runtimeEnvironment,
    planId: input.plan._id,
    customerRef: input.customer.customerRef,
    customerName: input.customer.name,
    billingCurrency: input.customer.market,
    localAmount: initialQuote.localAmount,
    paymentProvider,
    paymentAccountType: "bank",
    paymentAccountNumber:
      paymentProvider === "partna" ? partnaBankTransfer?.accountNumber ?? null : null,
    paymentNetworkId:
      paymentProvider === "partna" ? partnaBankTransfer?.bankCode ?? null : null,
    paymentProfileSnapshot: paymentProfile,
    status: "pending_activation",
    pendingStatus: "active",
    protocolSyncStatus: "pending_activation",
    nextChargeAt,
  });

  const activationOperation = await queueSubscriptionProtocolCreate({
    merchantId: input.merchant._id.toString(),
    actor: input.customer.email,
    environment: input.runtimeEnvironment,
    subscriptionId: subscription._id.toString(),
    checkoutSessionId: input.session._id.toString(),
    triggerInitialCharge: true,
  });

  if (!activationOperation) {
    await SubscriptionModel.findByIdAndDelete(subscription._id).exec();
    throw new HttpError(
      409,
      "Subscription could not be created on-chain for this checkout."
    );
  }

  const persistedSubscription = await SubscriptionModel.findById(subscription._id)
    .select({ nextChargeAt: 1 })
    .exec();

  input.customer.subscriptionCount += 1;
  input.customer.nextRenewalAt =
    persistedSubscription?.nextChargeAt ?? subscription.nextChargeAt;
  await input.customer.save();

  const refreshedSession = await ensureCheckoutSession(input.sessionId);
  refreshedSession.customerDraft = {
    name: input.customer.name,
    email: input.customer.email,
    market: input.customer.market,
  };
  refreshedSession.customerId = input.customer._id;
  refreshedSession.subscriptionId = subscription._id;
  refreshedSession.submittedAt = refreshedSession.submittedAt ?? new Date();
  refreshedSession.verificationSnapshot =
    paymentProvider === "partna"
      ? {
        provider: "partna",
        status: "verified",
        country: "NG",
        currency: input.customer.market,
        instructions: "Permanent bank instructions are ready for this customer.",
        verificationHint: null,
        verificationMethods: [],
        requiredFields: [],
      }
      : {
        provider: "yellow_card",
        status: "verified",
        country: null,
        currency: input.customer.market,
        instructions: "Payment details are ready.",
        verificationHint: null,
        verificationMethods: [],
        requiredFields: [],
      };

  if (!refreshedSession.chargeId) {
    refreshedSession.status = "scheduled";
  }

  await refreshedSession.save();

  await queueSubscriptionCreatedNotifications({
    merchantId: input.merchant._id.toString(),
    environment: input.runtimeEnvironment,
    subscriptionId: subscription._id.toString(),
  }).catch(() => undefined);

  return getCheckoutSession(input.sessionId);
}

async function createYellowCardCheckoutPaymentAttempt(input: {
  sessionId: string;
  session: Awaited<ReturnType<typeof ensureCheckoutSession>>;
  merchant: Awaited<ReturnType<typeof ensureMerchantForCheckout>>;
  plan: Awaited<ReturnType<typeof ensurePlanForCheckout>>;
  customer: Awaited<ReturnType<typeof upsertCheckoutCustomer>>;
  runtimeEnvironment: RuntimeMode;
}) {
  const initialQuote = await quoteUsdAmountInBillingCurrency({
    environment: input.runtimeEnvironment,
    currency: input.customer.market,
    usdAmount: input.plan.usdAmount,
  });
  const nextChargeAt =
    input.plan.trialDays > 0 ? addDays(new Date(), input.plan.trialDays) : new Date();
  const subscription = await SubscriptionModel.create({
    merchantId: input.merchant._id,
    environment: input.runtimeEnvironment,
    planId: input.plan._id,
    customerRef: input.customer.customerRef,
    customerName: input.customer.name,
    billingCurrency: input.customer.market,
    localAmount: initialQuote.localAmount,
    paymentProvider: "yellow_card",
    paymentAccountType: "bank",
    paymentAccountNumber: null,
    paymentNetworkId: null,
    paymentProfileSnapshot: null,
    status: "pending_activation",
    pendingStatus: "active",
    protocolSyncStatus: "pending_activation",
    nextChargeAt,
  });
  try {
    const channel = await getPreferredCollectionChannel(
      input.customer.market,
      input.runtimeEnvironment
    );
    const network = await getPreferredCollectionNetwork(
      channel.externalId,
      channel.country,
      input.runtimeEnvironment
    ).catch(() => null);
    const collection = (await createCollectionRequest({
      merchantId: input.merchant._id.toString(),
      environment: input.runtimeEnvironment,
      channelId: channel.externalId,
      customerRef: input.customer.customerRef,
      customerName: input.customer.name,
      localAmount: initialQuote.localAmount,
      usdAmount: initialQuote.usdcAmount,
      currency: input.customer.market,
      country: channel.country,
      networkId: network?.externalId ?? null,
      accountType: channel.channelType === "momo" ? "momo" : "bank",
    })) as Record<string, unknown>;

    const collectionStatus = String(collection.status ?? "processing").toLowerCase();
    const externalChargeId = String(
      collection.sequenceId ?? collection.id ?? `renew-checkout-${Date.now()}`
    );
    const collectionSnapshot = {
      provider: "yellow_card" as const,
      kind: "bank_transfer" as const,
      externalChargeId,
      billingCurrency: input.customer.market,
      localAmount: initialQuote.localAmount,
      usdcAmount: initialQuote.usdcAmount,
      feeAmount: initialQuote.feeAmount,
      status: collectionStatus,
      reference: toNullableString(collection.reference),
      expiresAt:
        typeof collection.expiresAt === "string" || collection.expiresAt instanceof Date
          ? new Date(collection.expiresAt)
          : null,
      redirectUrl: null,
      bankTransfer:
        typeof collection.bankInfo === "object" && collection.bankInfo !== null
          ? {
              bankCode: toNullableString((collection.bankInfo as Record<string, unknown>).bankCode),
              bankName: toNullableString((collection.bankInfo as Record<string, unknown>).name),
              accountNumber: toNullableString(
                (collection.bankInfo as Record<string, unknown>).accountNumber
              ),
              accountName: toNullableString(
                (collection.bankInfo as Record<string, unknown>).accountName
              ),
              currency: input.customer.market,
            }
          : null,
    };

    const treasury = await getTreasuryByMerchantId(
      input.merchant._id.toString(),
      input.runtimeEnvironment
    ).catch(() => ({
      account: null,
    }));
    const destinationWallet = treasury.account?.payoutWallet ?? input.merchant.payoutWallet;

    if (!destinationWallet) {
      throw new HttpError(409, "Merchant payout wallet is not configured.");
    }

    const charge = await ChargeModel.create({
      merchantId: input.merchant._id,
      environment: input.runtimeEnvironment,
      sourceKind: "subscription",
      subscriptionId: subscription._id,
      invoiceId: null,
      externalChargeId,
      settlementSource: input.merchant.payoutWallet,
      paymentProvider: "yellow_card",
      localAmount: initialQuote.localAmount,
      fxRate: initialQuote.fxRate,
      usdcAmount: initialQuote.usdcAmount,
      feeAmount: initialQuote.feeAmount,
      status: "pending",
      failureCode: null,
      protocolChargeId: null,
      protocolSyncStatus: "pending_execution",
      protocolTxHash: null,
      providerMetadata: {
        paymentInstructions: collectionSnapshot,
        checkoutSessionId: input.session._id.toString(),
      },
      processedAt: new Date(),
    });

    const settlement = await createSettlement({
      merchantId: input.merchant._id.toString(),
      environment: input.runtimeEnvironment,
      sourceChargeId: charge._id.toString(),
      sourceKind: "subscription",
      batchRef: externalChargeId,
      commercialRef: subscription._id.toString(),
      grossUsdc: Number(initialQuote.usdcAmount.toFixed(2)),
      feeUsdc: initialQuote.feeAmount,
      netUsdc: Number(
        Math.max(0.01, initialQuote.usdcAmount - initialQuote.feeAmount).toFixed(2)
      ),
      destinationWallet,
      localAmount: initialQuote.localAmount,
      fxRate: initialQuote.fxRate,
      status: "queued",
      scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
    });

    const refreshedSession = await ensureCheckoutSession(input.sessionId);
    refreshedSession.customerDraft = {
      name: input.customer.name,
      email: input.customer.email,
      market: input.customer.market,
    };
    refreshedSession.customerId = input.customer._id;
    refreshedSession.subscriptionId = subscription._id;
    refreshedSession.chargeId = charge._id;
    refreshedSession.settlementId = new Types.ObjectId(settlement.id);
    refreshedSession.submittedAt = refreshedSession.submittedAt ?? new Date();
    refreshedSession.status = "pending_payment";
    refreshedSession.verificationSnapshot = {
      provider: "yellow_card",
      status: "verified",
      country: channel.country,
      currency: input.customer.market,
      instructions: "Payment details are ready.",
      verificationHint: null,
      verificationMethods: [],
      requiredFields: [],
    };
    refreshedSession.paymentSnapshot = {
      provider: collectionSnapshot.provider,
      kind: collectionSnapshot.kind,
      externalChargeId: collectionSnapshot.externalChargeId,
      billingCurrency: collectionSnapshot.billingCurrency,
      localAmount: collectionSnapshot.localAmount,
      usdcAmount: collectionSnapshot.usdcAmount,
      feeAmount: collectionSnapshot.feeAmount,
      status: collectionSnapshot.status,
      reference: collectionSnapshot.reference,
      expiresAt: collectionSnapshot.expiresAt,
      redirectUrl: null,
      bankTransfer: collectionSnapshot.bankTransfer,
    };
    refreshedSession.failureReason = null;
    await refreshedSession.save();

    return getCheckoutSession(input.sessionId);
  } catch (error) {
    await SubscriptionModel.findByIdAndDelete(subscription._id).exec().catch(() => null);
    throw error;
  }
}

async function ensureYellowCardCheckoutSubscriptionReady(input: {
  session: Awaited<ReturnType<typeof ensureCheckoutSession>>;
  environment: RuntimeMode;
}) {
  if (!input.session.subscriptionId) {
    return null;
  }

  const subscription = await SubscriptionModel.findById(input.session.subscriptionId).exec();

  if (!subscription) {
    throw new HttpError(404, "Checkout subscription was not found.");
  }

  const dueAt = addMilliseconds(new Date(), 5_000);
  subscription.nextChargeAt = dueAt;
  await subscription.save();

  if (
    subscription.status === "active" &&
    subscription.protocolSubscriptionId &&
    subscription.protocolSyncStatus === "synced"
  ) {
    const resumed = await queueSubscriptionProtocolResume({
      merchantId: input.session.merchantId.toString(),
      actor: input.session.customerDraft?.email ?? "checkout",
      environment: input.environment,
      subscriptionId: subscription._id.toString(),
    });

    if (!resumed) {
      throw new HttpError(
        409,
        "Checkout subscription could not be rescheduled on-chain for settlement."
      );
    }

    return SubscriptionModel.findById(subscription._id).exec();
  }

  const activation = await queueSubscriptionProtocolCreate({
    merchantId: input.session.merchantId.toString(),
    actor: input.session.customerDraft?.email ?? "checkout",
    environment: input.environment,
    subscriptionId: subscription._id.toString(),
    checkoutSessionId: input.session._id.toString(),
    triggerInitialCharge: false,
  });

  if (!activation) {
    throw new HttpError(
      409,
      "Checkout subscription could not be activated on-chain for settlement."
    );
  }

  return SubscriptionModel.findById(subscription._id).exec();
}

export async function submitCheckoutCustomer(
  sessionId: string,
  input: SubmitCheckoutCustomerInput
) {
  const session = await ensureCheckoutSession(sessionId);

  if (session.expiresAt.getTime() <= Date.now()) {
    session.status = "expired";
    await session.save();
    throw new HttpError(410, "Checkout session has expired.");
  }

  if (
    session.status === "settled" ||
    session.status === "failed" ||
    session.status === "expired"
  ) {
    return getCheckoutSession(sessionId);
  }

  const [merchant, plan] = await Promise.all([
    ensureMerchantForCheckout(
      session.merchantId.toString(),
      session.environment === "live" ? "live" : "test"
    ),
    ensurePlanForCheckout(
      session.planId.toString(),
      session.merchantId.toString(),
      session.environment === "live" ? "live" : "test"
    ),
  ]);

  if (!plan.supportedMarkets.includes(input.market)) {
    throw new HttpError(409, "Selected market is not enabled for this plan.");
  }

  if (session.subscriptionId) {
    session.customerDraft = {
      name: input.name,
      email: input.email.trim().toLowerCase(),
      market: input.market,
    };
    await session.save();
    return getCheckoutSession(sessionId);
  }

  const runtimeEnvironment = session.environment === "live" ? "live" : "test";
  const customer = await upsertCheckoutCustomer(
    session.merchantId.toString(),
    runtimeEnvironment,
    input
  );
  const paymentProvider = getDefaultPaymentRailProvider(runtimeEnvironment);
  session.customerDraft = {
    name: customer.name,
    email: customer.email,
    market: customer.market,
  };
  session.customerId = customer._id;
  session.submittedAt = session.submittedAt ?? new Date();

  if (
    paymentProvider === "partna" &&
    !hasActivePartnaPaymentProfile(customer, input.market)
  ) {
    session.status = "pending_verification";
    session.verificationSnapshot = buildPartnaVerificationSnapshot(input.market);
    await session.save();
    return getCheckoutSession(sessionId);
  }

  await session.save();

  if (paymentProvider === "yellow_card") {
    return createYellowCardCheckoutPaymentAttempt({
      sessionId,
      session,
      merchant,
      plan,
      customer,
      runtimeEnvironment,
    });
  }

  return activateCheckoutSubscription({
    sessionId,
    session,
    merchant,
    plan,
    customer,
    runtimeEnvironment,
  });
}

export async function submitCheckoutVerification(
  sessionId: string,
  input: SubmitCheckoutVerificationInput
) {
  const session = await ensureCheckoutSession(sessionId);

  if (session.expiresAt.getTime() <= Date.now()) {
    session.status = "expired";
    await session.save();
    throw new HttpError(410, "Checkout session has expired.");
  }

  if (!session.customerId || !session.customerDraft?.email) {
    throw new HttpError(409, "Customer details must be submitted before verification.");
  }

  if (
    session.status === "settled" ||
    session.status === "failed" ||
    session.status === "expired"
  ) {
    return getCheckoutSession(sessionId);
  }

  const runtimeEnvironment = session.environment === "live" ? "live" : "test";
  const [merchant, plan, customer] = await Promise.all([
    ensureMerchantForCheckout(session.merchantId.toString(), runtimeEnvironment),
    ensurePlanForCheckout(
      session.planId.toString(),
      session.merchantId.toString(),
      runtimeEnvironment
    ),
    CustomerModel.findById(session.customerId).exec(),
  ]);

  if (!customer) {
    throw new HttpError(404, "Checkout customer was not found.");
  }

  if (input.bvn?.trim()) {
    session.verificationSnapshot = {
      provider: "partna",
      status: "processing",
      country: "NG",
      currency: customer.market,
      instructions: "Starting verification for this customer.",
      accountName: null,
      verificationMethod: null,
      verificationHint: null,
      verificationMethods: [],
      requiredFields: [],
    };
    await session.save();

    const pendingVerification = await startPartnaCustomerPaymentProfileVerification({
      customerId: customer._id.toString(),
      environment: runtimeEnvironment,
      verification: {
        bvn: input.bvn,
      },
    });

    session.status = "pending_verification";
    session.verificationSnapshot = buildPartnaMethodVerificationSnapshot({
      currency: customer.market,
      accountName: pendingVerification.accountName ?? "",
      verificationMethods: pendingVerification.verificationMethods,
    });
    await session.save();

    return getCheckoutSession(sessionId);
  }

  if (input.verificationMethod?.trim()) {
    const accountName = session.verificationSnapshot?.accountName ?? null;

    session.verificationSnapshot = {
      provider: "partna",
      status: "processing",
      country: "NG",
      currency: customer.market,
      instructions: "Sending verification code.",
      accountName,
      verificationMethod: null,
      verificationHint: null,
      verificationMethods: Array.isArray(session.verificationSnapshot?.verificationMethods)
        ? session.verificationSnapshot?.verificationMethods
        : [],
      requiredFields: [],
    };
    await session.save();

    const methodVerification =
      await continuePartnaCustomerPaymentProfileVerificationAfterMethod({
        customerId: customer._id.toString(),
        environment: runtimeEnvironment,
        verification: {
          verificationMethod: input.verificationMethod,
        },
        accountName,
      });

    session.status = "pending_verification";
    session.verificationSnapshot = methodVerification.phoneConfirmationRequired
      ? buildPartnaPhoneVerificationSnapshot({
          currency: customer.market,
          accountName: accountName ?? "",
          verificationMethod:
            methodVerification.verificationMethod ?? input.verificationMethod,
          verificationHint: methodVerification.verificationHint,
          instructions: methodVerification.phoneConfirmationMessage,
        })
      : buildPartnaOtpVerificationSnapshot({
          currency: customer.market,
          accountName: accountName ?? "",
          verificationMethod:
            methodVerification.verificationMethod ?? input.verificationMethod,
          verificationHint: methodVerification.verificationHint,
        });
    await session.save();

    return getCheckoutSession(sessionId);
  }

  if (input.phone?.trim()) {
    const accountName = session.verificationSnapshot?.accountName ?? null;
    const verificationMethod = session.verificationSnapshot?.verificationMethod ?? null;

    session.verificationSnapshot = {
      provider: "partna",
      status: "processing",
      country: "NG",
      currency: customer.market,
      instructions: "Confirming phone number and sending verification code.",
      accountName,
      verificationMethod,
      verificationHint: session.verificationSnapshot?.verificationHint ?? null,
      verificationMethods: [],
      requiredFields: [],
    };
    await session.save();

    const phoneVerification = await continuePartnaCustomerPaymentProfileVerificationAfterPhone({
      customerId: customer._id.toString(),
      environment: runtimeEnvironment,
      verification: {
        phone: input.phone,
      },
      accountName,
      verificationMethod,
    });

    session.status = "pending_verification";
    session.verificationSnapshot = buildPartnaOtpVerificationSnapshot({
      currency: customer.market,
      accountName: accountName ?? "",
      verificationMethod: phoneVerification.verificationMethod ?? verificationMethod ?? "email",
      verificationHint: phoneVerification.verificationHint,
    });
    await session.save();

    return getCheckoutSession(sessionId);
  }

  if (!input.otp?.trim()) {
    throw new HttpError(409, "Verification code is required.");
  }

  session.verificationSnapshot = {
    provider: "partna",
    status: "processing",
    country: "NG",
    currency: customer.market,
    instructions: "Finishing verification and preparing payment details.",
    accountName: session.verificationSnapshot?.accountName ?? null,
    verificationMethod: session.verificationSnapshot?.verificationMethod ?? null,
    verificationHint: session.verificationSnapshot?.verificationHint ?? null,
    verificationMethods: [],
    requiredFields: [],
  };
  await session.save();

  await completePartnaCustomerPaymentProfileVerification({
    customerId: customer._id.toString(),
    environment: runtimeEnvironment,
    verification: {
      otp: input.otp,
    },
    accountName: session.verificationSnapshot?.accountName ?? undefined,
  });

  const refreshedCustomer = (await CustomerModel.findById(customer._id).exec()) ?? customer;

  return activateCheckoutSubscription({
    sessionId,
    session,
    merchant,
    plan,
    customer: refreshedCustomer,
    runtimeEnvironment,
  });
}

export async function quoteCheckoutSessionMarket(sessionId: string, market: string) {
  const session = await ensureCheckoutSession(sessionId);

  if (session.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(410, "Checkout session has expired.");
  }

  const runtimeEnvironment = session.environment === "live" ? "live" : "test";
  const [merchant, plan] = await Promise.all([
    ensureMerchantForCheckout(session.merchantId.toString(), runtimeEnvironment),
    ensurePlanForCheckout(
      session.planId.toString(),
      session.merchantId.toString(),
      runtimeEnvironment
    ),
  ]);

  if (!merchant.supportedMarkets.includes(market)) {
    throw new HttpError(409, `Market ${market} is not enabled for this merchant.`);
  }

  if (!plan.supportedMarkets.includes(market)) {
    throw new HttpError(409, `Market ${market} is not enabled for this plan.`);
  }

  return quoteUsdAmountInBillingCurrency({
    environment: runtimeEnvironment,
    currency: market,
    usdAmount: plan.usdAmount,
  });
}

export async function completeCheckoutTestPayment(sessionId: string) {
  const session = await ensureCheckoutSession(sessionId);

  if (session.environment !== "test") {
    throw new HttpError(
      409,
      "Test payment completion is only available in sandbox mode."
    );
  }

  if (!session.paymentSnapshot?.externalChargeId) {
    throw new HttpError(409, "Checkout session has no pending payment to complete.");
  }

  if (session.paymentSnapshot.provider === "yellow_card") {
    const [existingCharge, existingSettlement] = await Promise.all([
      session.chargeId ? ChargeModel.findById(session.chargeId).exec() : Promise.resolve(null),
      session.settlementId
        ? SettlementModel.findById(session.settlementId).exec()
        : Promise.resolve(null),
    ]);

    const readySubscription = await ensureYellowCardCheckoutSubscriptionReady({
      session,
      environment: "test",
    });

    await waitForTimestamp(readySubscription?.nextChargeAt ?? null);

    if (
      existingCharge &&
      existingSettlement &&
      (existingCharge.status === "awaiting_settlement" ||
        existingCharge.status === "confirming" ||
        existingSettlement.status === "queued" ||
        existingSettlement.status === "confirming")
    ) {
      await queueSettlementBridge(existingSettlement._id.toString(), {
        merchantId: existingSettlement.merchantId.toString(),
        environment: "test",
      });

      return getCheckoutSession(sessionId);
    }

    const acceptedCollection = await acceptCollectionRequest(
      session.paymentSnapshot.externalChargeId,
      "test"
    );

    await processYellowCardWebhook(
      {
        event: "collection.updated",
        status: "success",
        sequenceId: session.paymentSnapshot.externalChargeId,
        id:
          typeof (acceptedCollection as Record<string, unknown>).id === "string"
            ? ((acceptedCollection as Record<string, unknown>).id as string)
            : session.paymentSnapshot.externalChargeId,
        data: {
          ...(acceptedCollection as Record<string, unknown>),
          status: "success",
        },
      },
      "test"
    );

    return getCheckoutSession(sessionId);
  }

  if (session.paymentSnapshot.provider !== "partna") {
    throw new HttpError(
      409,
      "Sandbox payment completion is not implemented for this checkout provider."
    );
  }

  const accountNumber = session.paymentSnapshot.bankTransfer?.accountNumber;

  if (!accountNumber) {
    throw new HttpError(409, "Checkout session has no static bank instructions.");
  }

  const provider = getPartnaProvider("test");

  if (!provider.makeMockPayment) {
    throw new HttpError(500, "Partna sandbox mock payments are unavailable.");
  }

  const mockResult = await provider.makeMockPayment({
    accountNumber,
    paymentAmount: session.paymentSnapshot.localAmount ?? 0,
    currency: session.paymentSnapshot.billingCurrency ?? "NGN",
    reference:
      session.paymentSnapshot.reference ?? session.paymentSnapshot.externalChargeId,
  });

  await processPartnaWebhook(
    {
      event: "voucher.updated",
      data: {
        id: session.paymentSnapshot.externalChargeId,
        voucherCode: toNullableString((mockResult as Record<string, unknown>).voucherCode),
        email: session.customerDraft?.email ?? null,
        fullName: session.customerDraft?.name ?? null,
        amount: session.paymentSnapshot.localAmount ?? null,
        currency: session.paymentSnapshot.billingCurrency ?? null,
        fee: 0,
        status: "success",
      },
    },
    "test"
  );

  return getCheckoutSession(sessionId);
}
