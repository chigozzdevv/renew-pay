import { HttpError } from "@/shared/errors/http-error";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";

import { ChargeModel } from "@/features/charges/charge.model";
import { CustomerModel } from "@/features/customers/customer.model";
import { InvoiceModel } from "@/features/invoices/invoice.model";
import { emitChargeWebhookEventForStatusChange } from "@/features/developers/developer-webhook-delivery.service";
import { assertMerchantKybApprovedForLive } from "@/features/kyc/kyc.service";
import type { MerchantRecord } from "@/features/merchants/merchant.model";
import { queueChargeStatusNotifications } from "@/features/notifications/notification.service";
import { createSettlement } from "@/features/settlements/settlement.service";
import type {
  CreateChargeInput,
  ListChargesQuery,
  UpdateChargeInput,
} from "@/features/charges/charge.validation";
import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  quoteUsdAmountInBillingCurrency,
} from "@/features/payment-rails/payment-rails.service";
import {
  createPartnaChargeInstruction,
  derivePartnaFeeAmountUsdc,
} from "@/features/payment-rails/partna.service";
import type { PlanRecord } from "@/features/plans/plan.model";
import { PlanModel } from "@/features/plans/plan.model";
import type { SubscriptionRecord } from "@/features/subscriptions/subscription.model";
import { SubscriptionModel } from "@/features/subscriptions/subscription.model";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import {
  buildPagination,
  resolvePagination,
  type ListResult,
} from "@/shared/utils/pagination";
import {
  createRuntimeModeCondition,
  matchesRuntimeMode,
  toStoredRuntimeMode,
} from "@/shared/utils/runtime-environment";
import { normalizeSolanaAddress } from "@/shared/constants/solana";

function toChargeResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  sourceKind?: string | null;
  subscriptionId?: { toString(): string } | null;
  invoiceId?: { toString(): string } | null;
  externalChargeId: string;
  settlementSource?: string | null;
  localAmount: number;
  fxRate: number;
  usdcAmount: number;
  feeAmount: number;
  status: string;
  failureCode?: string | null;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}, context?: {
  customerName?: string | null;
  invoiceNumber?: string | null;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    sourceKind:
      document.sourceKind === "invoice" ? "invoice" : "subscription",
    subscriptionId: document.subscriptionId?.toString() ?? null,
    invoiceId: document.invoiceId?.toString() ?? null,
    customerName: context?.customerName ?? null,
    invoiceNumber: context?.invoiceNumber ?? null,
    externalChargeId: document.externalChargeId,
    settlementSource: document.settlementSource ?? null,
    localAmount: document.localAmount,
    fxRate: document.fxRate,
    usdcAmount: document.usdcAmount,
    feeAmount: document.feeAmount,
    status: document.status,
    failureCode: document.failureCode ?? null,
    processedAt: document.processedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function mapChargesWithContext(
  charges: Array<Parameters<typeof toChargeResponse>[0]>
) {
  const subscriptionIds = [
    ...new Set(
      charges.flatMap((charge) =>
        charge.subscriptionId ? [charge.subscriptionId.toString()] : []
      )
    ),
  ];
  const invoiceIds = [
    ...new Set(
      charges.flatMap((charge) => (charge.invoiceId ? [charge.invoiceId.toString()] : []))
    ),
  ];
  const [subscriptions, invoices] = await Promise.all([
    subscriptionIds.length
      ? SubscriptionModel.find({
          _id: { $in: subscriptionIds },
        })
          .select({ _id: 1, customerName: 1 })
          .lean()
          .exec()
      : Promise.resolve([]),
    invoiceIds.length
      ? InvoiceModel.find({
          _id: { $in: invoiceIds },
        })
          .select({ _id: 1, customerName: 1, invoiceNumber: 1 })
          .lean()
          .exec()
      : Promise.resolve([]),
  ]);
  const customerNameBySubscriptionId = new Map(
    subscriptions.map((subscription) => [subscription._id.toString(), subscription.customerName])
  );
  const invoiceContextById = new Map(
    invoices.map((invoice) => [
      invoice._id.toString(),
      {
        customerName: invoice.customerName,
        invoiceNumber: invoice.invoiceNumber,
      },
    ])
  );

  return charges.map((charge) =>
    toChargeResponse(charge, charge.sourceKind === "invoice"
      ? invoiceContextById.get(charge.invoiceId?.toString() ?? "")
      : {
          customerName:
            charge.subscriptionId
              ? customerNameBySubscriptionId.get(charge.subscriptionId.toString()) ?? null
              : null,
          invoiceNumber: null,
        })
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function runPartnaSubscriptionChargeJob(input: {
  merchant: MerchantRecord;
  plan: PlanRecord;
  subscription: SubscriptionRecord;
  environment: RuntimeMode;
}) {
  const merchant = input.merchant;
  const plan = input.plan;
  const subscription = input.subscription;

  if (!merchant || !plan || !subscription) {
    throw new HttpError(404, "Partna charge dependencies were not found.");
  }

  const customer = await CustomerModel.findOne({
    merchantId: merchant._id,
    customerRef: subscription.customerRef,
    ...createRuntimeModeCondition("environment", input.environment),
  }).exec();

  if (!customer?.paymentProfile?.bankTransfer?.accountNumber) {
    throw new HttpError(
      409,
      "Customer is missing active Partna bank instructions."
    );
  }

  const quote = await quoteUsdAmountInBillingCurrency({
    environment: input.environment,
    currency: subscription.billingCurrency,
    usdAmount: plan.usdAmount,
  });
  const localAmount = quote.localAmount;
  const usdcAmount = quote.usdcAmount;
  const fxRate = quote.fxRate;

  const { voucher, paymentSnapshot } = await createPartnaChargeInstruction({
    environment: input.environment,
    customerEmail: customer.email,
    customerName: customer.name,
    localAmount,
    paymentProfile: customer.paymentProfile,
  });
  const feeAmount =
    derivePartnaFeeAmountUsdc({
      fxRate,
      voucher,
    }) ?? quote.feeAmount;
  const netUsdc = Number(Math.max(0.01, usdcAmount - feeAmount).toFixed(2));
  const destinationWallet = merchant.payoutWallet;

  if (!destinationWallet) {
    throw new HttpError(409, "Merchant payout wallet is not configured.");
  }
  const now = new Date();

  const charge = await ChargeModel.create({
    merchantId: merchant._id,
    environment: input.environment,
    sourceKind: "subscription",
    subscriptionId: subscription._id,
    invoiceId: null,
    externalChargeId: voucher.voucherId,
    settlementSource: destinationWallet,
    paymentProvider: "partna",
    localAmount,
    fxRate,
    usdcAmount,
    feeAmount,
    status: "pending",
    failureCode: null,
    providerMetadata: {
      email: customer.email,
      voucherCode: voucher.voucherCode,
      voucherId: voucher.voucherId,
      reference: voucher.reference,
      voucherFee: voucher.fee,
      voucherWavedFee: voucher.wavedFee,
      feeBearer: voucher.feeBearer,
      paymentInstructions: paymentSnapshot,
      callbackUrl: customer.paymentProfile?.partna?.callbackUrl ?? null,
    },
    processedAt: now,
  });

  const settlement = await createSettlement({
    merchantId: merchant._id.toString(),
    environment: input.environment,
    sourceChargeId: charge._id.toString(),
    batchRef: `settlement-${voucher.voucherId}`,
    grossUsdc: Number(usdcAmount.toFixed(2)),
    feeUsdc: feeAmount,
    netUsdc,
    destinationWallet,
    sourceKind: "subscription",
    commercialRef: null,
    localAmount,
    fxRate,
    status: "queued",
    scheduledFor: new Date(now.getTime() + 5 * 60 * 1000),
  });

  subscription.status = "active";
  subscription.localAmount = localAmount;
  subscription.lastChargeAt = now;
  subscription.retryAvailableAt = null;
  subscription.nextChargeAt = addDays(now, plan.billingIntervalDays);
  await subscription.save();

  return {
    subscriptionId: subscription._id.toString(),
    chargeId: charge._id.toString(),
    externalChargeId: voucher.voucherId,
    settlementId: settlement.id,
    collectionStatus: voucher.status,
    settlementStatus: settlement.status,
    collection: {
      provider: "partna",
      kind: "bank_transfer",
      id: voucher.voucherId,
      sequenceId: voucher.voucherId,
      status: voucher.status,
      reference: voucher.reference,
      expiresAt: null,
      redirectUrl: voucher.paymentUrl,
      bankTransfer: paymentSnapshot.bankTransfer,
    },
  };
}

async function ensureChargeScope(
  chargeId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const mongoQuery: Record<string, unknown> = {
    _id: chargeId,
  };

  if (merchantId) {
    mongoQuery.merchantId = merchantId;
  }

  if (environment) {
    Object.assign(mongoQuery, createRuntimeModeCondition("environment", environment));
  }

  const charge = await ChargeModel.findOne(mongoQuery).exec();

  if (!charge) {
    throw new HttpError(404, "Charge was not found.");
  }

  return charge;
}

export async function createCharge(input: CreateChargeInput) {
  const [merchantExists, subscriptionExists] = await Promise.all([
    MerchantModel.exists({ _id: input.merchantId }),
    SubscriptionModel.exists({
      _id: input.subscriptionId,
      merchantId: input.merchantId,
      ...createRuntimeModeCondition("environment", input.environment),
    }),
  ]);

  if (!merchantExists) {
    throw new HttpError(404, "Merchant was not found.");
  }

  if (!subscriptionExists) {
    throw new HttpError(404, "Subscription was not found.");
  }

  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "creating charges",
    input.environment
  );

  const charge = await ChargeModel.create({
    merchantId: input.merchantId,
    environment: input.environment,
    sourceKind: "subscription",
    subscriptionId: input.subscriptionId,
    invoiceId: null,
    externalChargeId: input.externalChargeId,
    settlementSource: normalizeSolanaAddress(input.settlementSource),
    localAmount: input.localAmount,
    fxRate: input.fxRate,
    usdcAmount: input.usdcAmount,
    feeAmount: input.feeAmount,
    status: input.status,
    failureCode: input.failureCode ?? null,
    processedAt: input.processedAt ?? new Date(),
  });

  await emitChargeWebhookEventForStatusChange({
    previousStatus: null,
    chargeId: charge._id.toString(),
    nextStatus: charge.status,
  });
  await queueChargeStatusNotifications({
    chargeId: charge._id.toString(),
    previousStatus: null,
    nextStatus: charge.status,
  }).catch(() => undefined);

  return toChargeResponse(charge);
}

export async function listCharges(query: ListChargesQuery) {
  const filters: Record<string, unknown>[] = [];

  if (query.merchantId) {
    filters.push({
      merchantId: query.merchantId,
    });
  }

  if (query.environment) {
    filters.push(createRuntimeModeCondition("environment", query.environment));
  }

  if (query.sourceKind) {
    filters.push({
      sourceKind: query.sourceKind,
    });
  }

  if (query.subscriptionId) {
    filters.push({
      subscriptionId: query.subscriptionId,
    });
  }

  if (query.status) {
    filters.push({
      status: query.status,
    });
  }

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "i");
    const [matchingSubscriptions, matchingInvoices] = await Promise.all([
      SubscriptionModel.find({
        customerName: pattern,
      })
        .select({ _id: 1 })
        .lean()
        .exec(),
      InvoiceModel.find({
        $or: [
          { invoiceNumber: pattern },
          { title: pattern },
          { customerName: pattern },
          { customerEmail: pattern },
        ],
      })
        .select({ _id: 1 })
        .lean()
        .exec(),
    ]);
    const subscriptionIds = matchingSubscriptions.map((entry) => entry._id);
    const invoiceIds = matchingInvoices.map((entry) => entry._id);

    filters.push({
      $or: [
        { externalChargeId: pattern },
        ...(subscriptionIds.length ? [{ subscriptionId: { $in: subscriptionIds } }] : []),
        ...(invoiceIds.length ? [{ invoiceId: { $in: invoiceIds } }] : []),
      ],
    });
  }

  const mongoQuery =
    filters.length === 0
      ? {}
      : filters.length === 1
        ? filters[0]
        : { $and: filters };

  const pagination = resolvePagination(query);

  if (!pagination) {
    const charges = await ChargeModel.find(mongoQuery)
      .sort({ processedAt: -1 })
      .exec();

    return {
      items: await mapChargesWithContext(charges),
    } satisfies ListResult<ReturnType<typeof toChargeResponse>>;
  }

  const [total, charges] = await Promise.all([
    ChargeModel.countDocuments(mongoQuery).exec(),
    ChargeModel.find(mongoQuery)
      .sort({ processedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: await mapChargesWithContext(charges),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toChargeResponse>>;
}

export async function getChargeById(
  chargeId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const charge = await ensureChargeScope(chargeId, merchantId, environment);
  const [subscription, invoice] = await Promise.all([
    charge.subscriptionId
      ? SubscriptionModel.findById(charge.subscriptionId)
          .select({ customerName: 1 })
          .lean()
          .exec()
      : Promise.resolve(null),
    charge.invoiceId
      ? InvoiceModel.findById(charge.invoiceId)
          .select({ customerName: 1, invoiceNumber: 1 })
          .lean()
          .exec()
      : Promise.resolve(null),
  ]);

  return toChargeResponse(charge, charge.sourceKind === "invoice"
    ? {
        customerName: invoice?.customerName ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
      }
    : {
        customerName: subscription?.customerName ?? null,
        invoiceNumber: null,
      });
}

export async function updateCharge(
  chargeId: string,
  input: UpdateChargeInput,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const charge = await ensureChargeScope(chargeId, merchantId, environment);
  const previousStatus = charge.status;

  if (input.status !== undefined) {
    charge.status = input.status;
  }

  if (input.failureCode !== undefined) {
    charge.failureCode = input.failureCode ?? null;
  }

  if (input.processedAt !== undefined) {
    charge.processedAt = input.processedAt;
  }

  await charge.save();
  await emitChargeWebhookEventForStatusChange({
    previousStatus,
    chargeId: charge._id.toString(),
    nextStatus: charge.status,
  });
  await queueChargeStatusNotifications({
    chargeId: charge._id.toString(),
    previousStatus,
    nextStatus: charge.status,
  }).catch(() => undefined);

  const [subscription, invoice] = await Promise.all([
    charge.subscriptionId
      ? SubscriptionModel.findById(charge.subscriptionId)
          .select({ customerName: 1 })
          .lean()
          .exec()
      : Promise.resolve(null),
    charge.invoiceId
      ? InvoiceModel.findById(charge.invoiceId)
          .select({ customerName: 1, invoiceNumber: 1 })
          .lean()
          .exec()
      : Promise.resolve(null),
  ]);

  return toChargeResponse(charge, charge.sourceKind === "invoice"
    ? {
        customerName: invoice?.customerName ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
      }
    : {
        customerName: subscription?.customerName ?? null,
        invoiceNumber: null,
      });
}

export async function queueChargeRetry(
  chargeId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const charge = await ensureChargeScope(chargeId, merchantId, environment);

  await assertMerchantKybApprovedForLive(
    charge.merchantId.toString(),
    "retrying charges",
    toStoredRuntimeMode(charge.environment)
  );

  if (charge.sourceKind === "invoice") {
    throw new HttpError(
      409,
      "Invoice payment attempts should be retried from the invoice record."
    );
  }

  if (charge.status === "settled") {
    throw new HttpError(409, "Settled charges cannot be retried.");
  }

  if (!charge.subscriptionId) {
    throw new HttpError(409, "Charge is missing its source subscription.");
  }

  const subscriptionId = charge.subscriptionId.toString();

  const result = await enqueueQueueJob(
    queueNames.subscriptionCharge,
    "subscription-charge-retry",
    { subscriptionId },
    {
      attempts: 5,
      jobId: `subscription-charge-retry-${subscriptionId}-${Date.now()}`,
    }
  );

  if (!result) {
    const inlineResult = await runSubscriptionChargeJob({
      subscriptionId,
    });

    return {
      queued: false,
      processedInline: true,
      chargeId,
      result: inlineResult,
    };
  }

  return {
    queued: true,
    chargeId,
  };
}

export async function runSubscriptionChargeJob(input: { subscriptionId: string }) {
  const subscription = await SubscriptionModel.findById(input.subscriptionId).exec();

  if (!subscription) {
    throw new HttpError(404, "Subscription was not found.");
  }

  const environment = toStoredRuntimeMode(subscription.environment);

  const [merchant, plan] = await Promise.all([
    MerchantModel.findById(subscription.merchantId).exec(),
    PlanModel.findById(subscription.planId).exec(),
  ]);

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  await assertMerchantKybApprovedForLive(
    merchant._id.toString(),
    "running subscription charges",
    environment
  );

  if (!plan) {
    throw new HttpError(404, "Plan was not found.");
  }

  if (!matchesRuntimeMode(plan.environment, environment)) {
    throw new HttpError(409, "Plan environment does not match this subscription.");
  }

  if (merchant.status !== "active") {
    throw new HttpError(409, "Merchant is not active.");
  }

  if (plan.status !== "active") {
    throw new HttpError(409, "Plan is not active.");
  }

  if (plan.billingMode === "metered") {
    throw new HttpError(
      409,
      "Metered subscriptions require usage units before a charge can be executed."
    );
  }

  if (subscription.status !== "active") {
    return {
      skipped: true,
      reason: `Subscription is ${subscription.status}.`,
      subscriptionId: subscription._id.toString(),
    };
  }

  const now = new Date();

  if (subscription.nextChargeAt > now && !subscription.retryAvailableAt) {
    return {
      skipped: true,
      reason: "Subscription is not due yet.",
      subscriptionId: subscription._id.toString(),
      nextChargeAt: subscription.nextChargeAt,
    };
  }

  if (subscription.retryAvailableAt && subscription.retryAvailableAt > now) {
    return {
      skipped: true,
      reason: "Retry window has not opened yet.",
      subscriptionId: subscription._id.toString(),
      retryAvailableAt: subscription.retryAvailableAt,
    };
  }

  return runPartnaSubscriptionChargeJob({
    merchant,
    plan,
    subscription,
    environment,
  });
}
