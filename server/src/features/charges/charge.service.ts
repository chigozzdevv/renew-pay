import { HttpError } from "@/shared/errors/http-error";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";

import { ChargeModel } from "@/features/charges/charge.model";
import { emitChargeWebhookEventForStatusChange } from "@/features/developers/developer-webhook-delivery.service";
import { assertMerchantKybApprovedForLive } from "@/features/kyc/kyc.service";
import { queueChargeStatusNotifications } from "@/features/notifications/notification.service";
import { recordProtocolChargeFailure } from "@/features/settlements/protocol-execution.service";
import { createSettlement } from "@/features/settlements/settlement.service";
import { deriveProtocolMerchantAddress } from "@/features/treasury/protocol-sync";
import { getTreasuryByMerchantId } from "@/features/treasury/treasury.service";
import type {
  CreateChargeInput,
  ListChargesQuery,
  UpdateChargeInput,
} from "@/features/charges/charge.validation";
import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  createCollectionRequest,
  getPreferredCollectionChannel,
  getPreferredCollectionNetwork,
  quoteUsdAmountInBillingCurrency,
} from "@/features/payment-rails/payment-rails.service";
import { PlanModel } from "@/features/plans/plan.model";
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
  subscriptionId: { toString(): string };
  externalChargeId: string;
  settlementSource?: string | null;
  localAmount: number;
  fxRate: number;
  usdcAmount: number;
  feeAmount: number;
  status: string;
  failureCode?: string | null;
  protocolChargeId?: string | null;
  protocolSyncStatus?: string | null;
  protocolTxHash?: string | null;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}, subscriptionCustomerName?: string | null) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    subscriptionId: document.subscriptionId.toString(),
    subscriptionCustomerName: subscriptionCustomerName ?? null,
    externalChargeId: document.externalChargeId,
    settlementSource: document.settlementSource ?? null,
    localAmount: document.localAmount,
    fxRate: document.fxRate,
    usdcAmount: document.usdcAmount,
    feeAmount: document.feeAmount,
    status: document.status,
    failureCode: document.failureCode ?? null,
    onchain: {
      id: document.protocolChargeId ?? null,
      status: document.protocolSyncStatus ?? "not_synced",
      txHash: document.protocolTxHash ?? null,
    },
    processedAt: document.processedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function mapChargesWithSubscriptionNames(
  charges: Array<Parameters<typeof toChargeResponse>[0]>
) {
  const subscriptionIds = [...new Set(charges.map((charge) => charge.subscriptionId.toString()))];
  const subscriptions = await SubscriptionModel.find({
    _id: { $in: subscriptionIds },
  })
    .select({ _id: 1, customerName: 1 })
    .lean()
    .exec();
  const customerNameBySubscriptionId = new Map(
    subscriptions.map((subscription) => [subscription._id.toString(), subscription.customerName])
  );

  return charges.map((charge) =>
    toChargeResponse(
      charge,
      customerNameBySubscriptionId.get(charge.subscriptionId.toString()) ?? null
    )
  );
}

function buildFallbackAccountNumber(customerRef: string) {
  const digits = customerRef.replace(/\D/g, "");

  return (digits || "1000000000").padStart(10, "0").slice(-10);
}

function deriveAccountType(
  explicitType: string | undefined,
  channelType: string
): "bank" | "momo" {
  if (explicitType === "momo") {
    return "momo";
  }

  if (explicitType === "bank") {
    return "bank";
  }

  return channelType.toLowerCase().includes("momo") ? "momo" : "bank";
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toProtocolFailureCode(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return (normalized || "COLLECTION_FAILED").slice(0, 32);
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
    subscriptionId: input.subscriptionId,
    externalChargeId: input.externalChargeId,
    settlementSource: normalizeSolanaAddress(input.settlementSource),
    localAmount: input.localAmount,
    fxRate: input.fxRate,
    usdcAmount: input.usdcAmount,
    feeAmount: input.feeAmount,
    status: input.status,
    failureCode: input.failureCode ?? null,
    protocolChargeId: null,
    protocolSyncStatus: "not_synced",
    protocolTxHash: null,
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
    const pattern = new RegExp(query.search, "i");
    filters.push({
      externalChargeId: pattern,
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
      items: await mapChargesWithSubscriptionNames(charges),
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
    items: await mapChargesWithSubscriptionNames(charges),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toChargeResponse>>;
}

export async function getChargeById(
  chargeId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const charge = await ensureChargeScope(chargeId, merchantId, environment);
  const subscription = await SubscriptionModel.findById(charge.subscriptionId)
    .select({ customerName: 1 })
    .lean()
    .exec();

  return toChargeResponse(charge, subscription?.customerName ?? null);
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

  if (input.status === "settled") {
    charge.protocolSyncStatus =
      charge.protocolSyncStatus === "not_synced"
        ? "settlement_credited"
        : charge.protocolSyncStatus;
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

  const subscription = await SubscriptionModel.findById(charge.subscriptionId)
    .select({ customerName: 1 })
    .lean()
    .exec();

  return toChargeResponse(charge, subscription?.customerName ?? null);
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

  if (charge.status === "settled") {
    throw new HttpError(409, "Settled charges cannot be retried.");
  }

  const result = await enqueueQueueJob(
    queueNames.subscriptionCharge,
    "subscription-charge-retry",
    { subscriptionId: charge.subscriptionId.toString() },
    {
      attempts: 5,
      jobId: `subscription-charge-retry-${charge.subscriptionId.toString()}-${Date.now()}`,
    }
  );

  if (!result) {
    const inlineResult = await runSubscriptionChargeJob({
      subscriptionId: charge.subscriptionId.toString(),
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

  if (!plan.protocolPlanId || plan.protocolSyncStatus !== "synced") {
    return {
      skipped: true,
      reason: "Plan is waiting for on-chain activation.",
      subscriptionId: subscription._id.toString(),
    };
  }

  if (plan.billingMode === "metered") {
    throw new HttpError(
      409,
      "Metered subscriptions require usage units before a charge can be executed."
    );
  }

  if (
    !subscription.protocolSubscriptionId ||
    subscription.protocolSyncStatus !== "synced" ||
    subscription.status === "pending_activation"
  ) {
    return {
      skipped: true,
      reason: "Subscription is waiting for on-chain activation.",
      subscriptionId: subscription._id.toString(),
    };
  }

  if (subscription.status === "paused" || subscription.status === "cancelled") {
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

  const channel = await getPreferredCollectionChannel(
    subscription.billingCurrency,
    environment
  );
  const network =
    subscription.paymentNetworkId
      ? await getPreferredCollectionNetwork(
          channel.externalId,
          channel.country,
          environment
        ).catch(() => null)
      : await getPreferredCollectionNetwork(
          channel.externalId,
          channel.country,
          environment
        );

  const quote = await quoteUsdAmountInBillingCurrency({
    environment,
    currency: subscription.billingCurrency,
    usdAmount: plan.usdAmount,
  });

  const localAmount = quote.localAmount;
  const usdcAmount = quote.usdcAmount;
  const fxRate = quote.fxRate;
  const feeAmount = quote.feeAmount;
  const netUsdc = Number(Math.max(0.01, usdcAmount - feeAmount).toFixed(2));

  const collection = (await createCollectionRequest({
    merchantId: merchant._id.toString(),
    environment,
    channelId: channel.externalId,
    customerRef: subscription.customerRef,
    customerName: subscription.customerName,
    localAmount,
    usdAmount: usdcAmount,
    currency: subscription.billingCurrency,
    country: channel.country,
    networkId:
      subscription.paymentNetworkId ?? network?.externalId ?? null,
    accountType: deriveAccountType(
      subscription.paymentAccountType,
      channel.channelType
    ),
    accountNumber:
      subscription.paymentAccountNumber ??
      buildFallbackAccountNumber(subscription.customerRef),
  })) as Record<string, unknown>;

  const collectionStatus = String(collection.status ?? "processing").toLowerCase();
  const externalChargeId = String(
    collection.sequenceId ?? collection.id ?? `renew-charge-${Date.now()}`
  );
  const collectionSnapshot = {
    id: toNullableString(collection.id),
    sequenceId: toNullableString(collection.sequenceId) ?? externalChargeId,
    status: collectionStatus,
    reference: toNullableString(collection.reference),
    depositId: toNullableString(collection.depositId),
    expiresAt:
      typeof collection.expiresAt === "string" || collection.expiresAt instanceof Date
        ? new Date(collection.expiresAt)
        : null,
    bankInfo:
      typeof collection.bankInfo === "object" && collection.bankInfo !== null
        ? {
            name: toNullableString((collection.bankInfo as Record<string, unknown>).name),
            accountNumber: toNullableString(
              (collection.bankInfo as Record<string, unknown>).accountNumber
            ),
            accountName: toNullableString(
              (collection.bankInfo as Record<string, unknown>).accountName
            ),
          }
        : null,
  };

  const treasury = await getTreasuryByMerchantId(
    merchant._id.toString(),
    environment
  ).catch(() => ({
    account: null,
  }));
  const protocolMerchantAddress = deriveProtocolMerchantAddress({
    environment: toStoredRuntimeMode(environment),
    merchantId: merchant._id.toString(),
  });

  if (collectionStatus === "failed") {
    const failedCharge = await ChargeModel.create({
      merchantId: merchant._id,
      environment,
      subscriptionId: subscription._id,
      externalChargeId,
      settlementSource: protocolMerchantAddress,
      localAmount,
      fxRate,
      usdcAmount,
      feeAmount,
      status: "failed",
      failureCode: "collection_failed",
      protocolChargeId: null,
      protocolSyncStatus:
        subscription.protocolSubscriptionId && subscription.protocolSyncStatus === "synced"
          ? "pending_failure_record"
          : "blocked_subscription_sync",
      protocolTxHash: null,
      processedAt: now,
    });

    subscription.status = "past_due";
    subscription.retryAvailableAt = new Date(
      now.getTime() + plan.retryWindowHours * 60 * 60 * 1000
    );
    await subscription.save();

    if (
      subscription.protocolSubscriptionId &&
      subscription.protocolSyncStatus === "synced"
    ) {
      const protocolFailure = await recordProtocolChargeFailure({
        environment,
        protocolSubscriptionId: subscription.protocolSubscriptionId,
        externalChargeId,
        failureCode: toProtocolFailureCode("collection_failed"),
      }).catch(() => null);

      if (protocolFailure) {
        failedCharge.protocolChargeId = protocolFailure.protocolChargeId;
        failedCharge.protocolSyncStatus = "failed_recorded";
        failedCharge.protocolTxHash = protocolFailure.txHash;
        await failedCharge.save();
      } else {
        failedCharge.protocolSyncStatus = "protocol_error";
        await failedCharge.save();
      }
    }

    await emitChargeWebhookEventForStatusChange({
      previousStatus: null,
      chargeId: failedCharge._id.toString(),
      nextStatus: failedCharge.status,
    });
    await queueChargeStatusNotifications({
      chargeId: failedCharge._id.toString(),
      previousStatus: null,
      nextStatus: failedCharge.status,
    }).catch(() => undefined);

    return {
      subscriptionId: subscription._id.toString(),
      chargeId: failedCharge._id.toString(),
      status: "failed",
      retryAvailableAt: subscription.retryAvailableAt,
      collection: collectionSnapshot,
    };
  }

  const charge = await ChargeModel.create({
    merchantId: merchant._id,
    environment,
    subscriptionId: subscription._id,
    externalChargeId,
    settlementSource: protocolMerchantAddress,
    localAmount,
    fxRate,
    usdcAmount,
      feeAmount,
      status: "pending",
      failureCode: null,
      protocolChargeId: null,
      protocolSyncStatus: "pending_execution",
      protocolTxHash: null,
      processedAt: now,
    });

  const settlement = await createSettlement({
    merchantId: merchant._id.toString(),
    environment,
    sourceChargeId: charge._id.toString(),
    batchRef: `settlement-${externalChargeId}`,
    grossUsdc: Number(usdcAmount.toFixed(2)),
    feeUsdc: feeAmount,
    netUsdc,
    destinationWallet: treasury.account?.payoutWallet ?? merchant.payoutWallet,
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
    externalChargeId,
    settlementId: settlement.id,
    collectionStatus,
    settlementStatus: settlement.status,
    collection: collectionSnapshot,
  };
}
