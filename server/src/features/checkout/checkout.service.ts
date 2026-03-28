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
import { quoteUsdAmountInBillingCurrency } from "@/features/payment-rails/payment-rails.service";
import {
  buildPartnaVerificationSnapshot,
  ensurePartnaCustomerPaymentProfile,
  hasActivePartnaPaymentProfile,
  processPartnaWebhook,
} from "@/features/payment-rails/partna.service";
import { getPartnaProvider } from "@/features/payment-rails/providers/partna/partna.factory";
import { PlanModel } from "@/features/plans/plan.model";
import {
  SettlementModel,
  type SettlementDocument,
} from "@/features/settlements/settlement.model";
import { SubscriptionModel } from "@/features/subscriptions/subscription.model";
import {
  ensureMerchantSubscriptionOperatorReady,
  queueSubscriptionProtocolCreate,
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
        requiredFields: [],
      }
      : null;

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
  session.customerDraft = {
    name: customer.name,
    email: customer.email,
    market: customer.market,
  };
  session.customerId = customer._id;
  session.submittedAt = session.submittedAt ?? new Date();

  if (!hasActivePartnaPaymentProfile(customer, input.market)) {
    session.status = "pending_verification";
    session.verificationSnapshot = buildPartnaVerificationSnapshot(input.market);
    await session.save();
    return getCheckoutSession(sessionId);
  }

  await session.save();

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

  session.verificationSnapshot = {
    provider: "partna",
    status: "processing",
    country: (input.country ?? "NG").toUpperCase(),
    currency: customer.market,
    instructions: "Creating permanent bank instructions for this customer.",
    requiredFields: [],
  };
  await session.save();

  await ensurePartnaCustomerPaymentProfile({
    customerId: customer._id.toString(),
    environment: runtimeEnvironment,
    verification: input,
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

  if (session.paymentSnapshot.provider !== "partna") {
    throw new HttpError(
      409,
      "Sandbox payment completion is only implemented for Partna checkout sessions."
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
