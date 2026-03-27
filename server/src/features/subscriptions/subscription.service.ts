import { HttpError } from "@/shared/errors/http-error";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";

import { runSubscriptionChargeJob } from "@/features/charges/charge.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { queueSubscriptionCreatedNotifications } from "@/features/notifications/notification.service";
import { quoteUsdAmountInBillingCurrency } from "@/features/payment-rails/payment-rails.service";
import { PlanModel } from "@/features/plans/plan.model";
import { SubscriptionModel } from "@/features/subscriptions/subscription.model";
import {
  queueSubscriptionProtocolCancel,
  queueSubscriptionProtocolCreate,
  queueSubscriptionProtocolMandateUpdate,
  queueSubscriptionProtocolPause,
  queueSubscriptionProtocolResume,
} from "@/features/treasury/treasury.service";
import type {
  CreateSubscriptionInput,
  ListSubscriptionsQuery,
  UpdateSubscriptionInput,
} from "@/features/subscriptions/subscription.validation";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import {
  buildPagination,
  resolvePagination,
  type ListResult,
} from "@/shared/utils/pagination";
import { createRuntimeModeCondition } from "@/shared/utils/runtime-environment";

function toSubscriptionResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  planId: { toString(): string };
  customerRef: string;
  customerName: string;
  billingCurrency: string;
  localAmount: number;
  paymentAccountType: string;
  paymentAccountNumber?: string | null;
  paymentNetworkId?: string | null;
  status: string;
  pendingStatus?: string | null;
  nextChargeAt: Date;
  lastChargeAt?: Date | null;
  retryAvailableAt?: Date | null;
  protocolSubscriptionId?: string | null;
  protocolOperationId?: { toString(): string } | null;
  protocolSyncStatus?: string | null;
  protocolTxHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    planId: document.planId.toString(),
    customerRef: document.customerRef,
    customerName: document.customerName,
    billingCurrency: document.billingCurrency,
    localAmount: document.localAmount,
    paymentAccountType: document.paymentAccountType,
    paymentAccountNumber: document.paymentAccountNumber ?? null,
    paymentNetworkId: document.paymentNetworkId ?? null,
    status: document.status,
    pendingStatus: document.pendingStatus ?? null,
    nextChargeAt: document.nextChargeAt,
    lastChargeAt: document.lastChargeAt ?? null,
    retryAvailableAt: document.retryAvailableAt ?? null,
    onchain: {
      id: document.protocolSubscriptionId ?? null,
      status: document.protocolSyncStatus ?? "not_synced",
      operationId: document.protocolOperationId?.toString() ?? null,
      txHash: document.protocolTxHash ?? null,
    },
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function ensureSubscriptionScope(
  subscriptionId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const mongoQuery: Record<string, unknown> = {
    _id: subscriptionId,
  };

  if (merchantId) {
    mongoQuery.merchantId = merchantId;
  }

  if (environment) {
    Object.assign(mongoQuery, createRuntimeModeCondition("environment", environment));
  }

  const subscription = await SubscriptionModel.findOne(mongoQuery).exec();

  if (!subscription) {
    throw new HttpError(404, "Subscription was not found.");
  }

  return subscription;
}

function toRuntimeMode(value: string): RuntimeMode {
  return value === "live" ? "live" : "test";
}

function resolveSubscriptionCreateState(inputStatus: CreateSubscriptionInput["status"]) {
  if (inputStatus !== "active" && inputStatus !== "pending_activation") {
    throw new HttpError(
      409,
      "Subscriptions can only enter the active lifecycle after protocol activation."
    );
  }

  return {
    status: "pending_activation",
    pendingStatus: "active",
    protocolSyncStatus: "pending_activation",
  } as const;
}

export async function createSubscription(input: CreateSubscriptionInput, actor = "system") {
  const [merchant, plan] = await Promise.all([
    MerchantModel.findById(input.merchantId).exec(),
    PlanModel.findOne({
      _id: input.planId,
      merchantId: input.merchantId,
      ...createRuntimeModeCondition("environment", input.environment),
    }).exec(),
  ]);

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  if (!plan) {
    throw new HttpError(404, "Plan was not found.");
  }

  if (plan.status !== "active" || !plan.protocolPlanId || plan.protocolSyncStatus !== "synced") {
    throw new HttpError(
      409,
      "Plan must be active on-chain before subscriptions can be created."
    );
  }

  if (!merchant.supportedMarkets.includes(input.billingCurrency)) {
    throw new HttpError(
      409,
      `Currency ${input.billingCurrency} is not enabled for this merchant.`
    );
  }

  if (!plan.supportedMarkets.includes(input.billingCurrency)) {
    throw new HttpError(
      409,
      `Currency ${input.billingCurrency} is not enabled for this plan.`
    );
  }

  const quote = await quoteUsdAmountInBillingCurrency({
    environment: input.environment,
    currency: input.billingCurrency,
    usdAmount: plan.usdAmount,
  });

  const requestedState = resolveSubscriptionCreateState(input.status);
  const createdSubscription = await SubscriptionModel.create({
    merchantId: input.merchantId,
    environment: input.environment,
    planId: input.planId,
    customerRef: input.customerRef,
    customerName: input.customerName,
    billingCurrency: input.billingCurrency,
    localAmount: quote.localAmount,
    paymentAccountType: input.paymentAccountType,
    paymentAccountNumber: input.paymentAccountNumber ?? null,
    paymentNetworkId: input.paymentNetworkId ?? null,
    status: requestedState.status,
    pendingStatus: requestedState.pendingStatus,
    protocolSyncStatus: requestedState.protocolSyncStatus,
    nextChargeAt: input.nextChargeAt,
  });

  const activationOperation = await queueSubscriptionProtocolCreate({
    merchantId: input.merchantId,
    actor,
    environment: input.environment,
    subscriptionId: createdSubscription._id.toString(),
  });

  if (!activationOperation) {
    await SubscriptionModel.findByIdAndDelete(createdSubscription._id).exec();
    throw new HttpError(
      409,
      "Subscription could not be created on-chain."
    );
  }

  const refreshedSubscription = await ensureSubscriptionScope(
    createdSubscription._id.toString(),
    input.merchantId,
    input.environment
  );

  await queueSubscriptionCreatedNotifications({
    merchantId: input.merchantId,
    environment: input.environment,
    subscriptionId: refreshedSubscription._id.toString(),
  }).catch(() => undefined);

  return toSubscriptionResponse(refreshedSubscription);
}

export async function listSubscriptions(query: ListSubscriptionsQuery) {
  const filters: Record<string, unknown>[] = [];

  if (query.merchantId) {
    filters.push({
      merchantId: query.merchantId,
    });
  }

  if (query.environment) {
    filters.push(createRuntimeModeCondition("environment", query.environment));
  }

  if (query.planId) {
    filters.push({
      planId: query.planId,
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
      $or: [{ customerName: pattern }, { customerRef: pattern }],
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
    const subscriptions = await SubscriptionModel.find(mongoQuery)
      .sort({ nextChargeAt: 1 })
      .exec();

    return {
      items: subscriptions.map(toSubscriptionResponse),
    } satisfies ListResult<ReturnType<typeof toSubscriptionResponse>>;
  }

  const [total, subscriptions] = await Promise.all([
    SubscriptionModel.countDocuments(mongoQuery).exec(),
    SubscriptionModel.find(mongoQuery)
      .sort({ nextChargeAt: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: subscriptions.map(toSubscriptionResponse),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toSubscriptionResponse>>;
}

export async function getSubscriptionById(
  subscriptionId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const subscription = await ensureSubscriptionScope(
    subscriptionId,
    merchantId,
    environment
  );

  return toSubscriptionResponse(subscription);
}

export async function updateSubscription(
  subscriptionId: string,
  input: UpdateSubscriptionInput,
  merchantId?: string,
  environment?: RuntimeMode,
  actor = "system"
) {
  const subscription = await ensureSubscriptionScope(
    subscriptionId,
    merchantId,
    environment
  );
  const previousStatus = subscription.status;
  const previousSnapshot = {
    status: subscription.status,
    pendingStatus: subscription.pendingStatus ?? null,
    nextChargeAt: subscription.nextChargeAt,
    lastChargeAt: subscription.lastChargeAt ?? null,
    retryAvailableAt: subscription.retryAvailableAt ?? null,
    localAmount: subscription.localAmount,
    paymentAccountType: subscription.paymentAccountType,
    paymentAccountNumber: subscription.paymentAccountNumber ?? null,
    paymentNetworkId: subscription.paymentNetworkId ?? null,
    protocolOperationId: subscription.protocolOperationId ?? null,
    protocolSyncStatus: subscription.protocolSyncStatus ?? null,
    protocolTxHash: subscription.protocolTxHash ?? null,
  };
  const paymentRoutingChanged =
    input.paymentAccountType !== undefined ||
    input.paymentAccountNumber !== undefined ||
    input.paymentNetworkId !== undefined;

  if (input.status !== undefined) {
    if (!subscription.protocolSubscriptionId && subscription.status === "pending_activation") {
      if (input.status === "cancelled") {
        subscription.status = "cancelled";
        subscription.pendingStatus = null;
        subscription.protocolSyncStatus = "not_synced";
        subscription.protocolOperationId = null;
        subscription.protocolTxHash = null;
      } else if (input.status === "active" || input.status === "pending_activation") {
        subscription.status = "pending_activation";
        subscription.pendingStatus = "active";
      } else {
        throw new HttpError(
          409,
          "Subscription cannot change lifecycle state until protocol activation completes."
        );
      }
    } else if (input.status === "paused") {
      subscription.pendingStatus = "paused";
    } else if (input.status === "cancelled") {
      subscription.pendingStatus = "cancelled";
    } else if (input.status === "active") {
      subscription.pendingStatus = "active";
    } else if (input.status === "past_due") {
      subscription.status = "past_due";
      subscription.pendingStatus = null;
    }
  }

  if (input.nextChargeAt !== undefined) {
    subscription.nextChargeAt = input.nextChargeAt;
  }

  if (input.retryAvailableAt !== undefined) {
    subscription.retryAvailableAt = input.retryAvailableAt ?? null;
  }

  if (input.lastChargeAt !== undefined) {
    subscription.lastChargeAt = input.lastChargeAt ?? null;
  }

  if (input.localAmount !== undefined) {
    subscription.localAmount = input.localAmount;
  }

  if (input.paymentAccountType !== undefined) {
    subscription.paymentAccountType = input.paymentAccountType;
  }

  if (input.paymentAccountNumber !== undefined) {
    subscription.paymentAccountNumber = input.paymentAccountNumber ?? null;
  }

  if (input.paymentNetworkId !== undefined) {
    subscription.paymentNetworkId = input.paymentNetworkId ?? null;
  }

  await subscription.save();
  const runtimeEnvironment = environment ?? toRuntimeMode(subscription.environment);

  try {
    if (!subscription.protocolSubscriptionId && subscription.status === "pending_activation") {
      const activationOperation = await queueSubscriptionProtocolCreate({
        merchantId: subscription.merchantId.toString(),
        actor,
        environment: runtimeEnvironment,
        subscriptionId: subscription._id.toString(),
      });

      if (!activationOperation) {
        throw new HttpError(
          409,
          "Subscription could not be created on-chain."
        );
      }
    } else {
      if (subscription.pendingStatus === "cancelled") {
        const cancelOperation = await queueSubscriptionProtocolCancel({
          merchantId: subscription.merchantId.toString(),
          actor,
          environment: runtimeEnvironment,
          subscriptionId: subscription._id.toString(),
        });

        if (!cancelOperation) {
          throw new HttpError(409, "Subscription cancellation could not be queued.");
        }
      } else if (subscription.pendingStatus === "paused") {
        const pauseOperation = await queueSubscriptionProtocolPause({
          merchantId: subscription.merchantId.toString(),
          actor,
          environment: runtimeEnvironment,
          subscriptionId: subscription._id.toString(),
        });

        if (!pauseOperation) {
          throw new HttpError(409, "Subscription pause could not be queued.");
        }
      } else if (
        subscription.pendingStatus === "active" ||
        (input.nextChargeAt !== undefined &&
          (previousStatus === "active" || previousStatus === "paused" || previousStatus === "past_due"))
      ) {
        const resumeOperation = await queueSubscriptionProtocolResume({
          merchantId: subscription.merchantId.toString(),
          actor,
          environment: runtimeEnvironment,
          subscriptionId: subscription._id.toString(),
        });

        if (!resumeOperation) {
          throw new HttpError(409, "Subscription resume could not be queued.");
        }
      }

      if (paymentRoutingChanged) {
        const mandateOperation = await queueSubscriptionProtocolMandateUpdate({
          merchantId: subscription.merchantId.toString(),
          actor,
          environment: runtimeEnvironment,
          subscriptionId: subscription._id.toString(),
        });

        if (!mandateOperation) {
          throw new HttpError(
            409,
            "Subscription mandate update could not be queued."
          );
        }
      }
    }
  } catch (error) {
    subscription.status = previousSnapshot.status;
    subscription.pendingStatus = previousSnapshot.pendingStatus;
    subscription.nextChargeAt = previousSnapshot.nextChargeAt;
    subscription.lastChargeAt = previousSnapshot.lastChargeAt;
    subscription.retryAvailableAt = previousSnapshot.retryAvailableAt;
    subscription.localAmount = previousSnapshot.localAmount;
    subscription.paymentAccountType = previousSnapshot.paymentAccountType;
    subscription.paymentAccountNumber = previousSnapshot.paymentAccountNumber;
    subscription.paymentNetworkId = previousSnapshot.paymentNetworkId;
    subscription.protocolOperationId = previousSnapshot.protocolOperationId;
    subscription.protocolSyncStatus = previousSnapshot.protocolSyncStatus;
    subscription.protocolTxHash = previousSnapshot.protocolTxHash;
    await subscription.save();
    throw error;
  }

  const refreshedSubscription = await ensureSubscriptionScope(
    subscription._id.toString(),
    subscription.merchantId.toString(),
    runtimeEnvironment
  );

  return toSubscriptionResponse(refreshedSubscription);
}

export async function queueSubscriptionCharge(
  subscriptionId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const subscription = await ensureSubscriptionScope(
    subscriptionId,
    merchantId,
    environment
  );

  if (
    subscription.status !== "active" ||
    !subscription.protocolSubscriptionId ||
    subscription.protocolSyncStatus !== "synced"
  ) {
    throw new HttpError(
      409,
      "Subscription must be active on-chain before a charge can be queued."
    );
  }

  const queuedJob = await enqueueQueueJob(
    queueNames.subscriptionCharge,
    "subscription-charge",
    { subscriptionId },
    {
      attempts: 5,
      jobId: `subscription-charge-${subscriptionId}-${Math.floor(
        Date.now() / 60000
      )}`,
    }
  );

  if (!queuedJob) {
    const result = await runSubscriptionChargeJob({ subscriptionId });

    return {
      queued: false,
      processedInline: true,
      subscriptionId,
      result,
    };
  }

  return {
    queued: true,
    subscriptionId,
  };
}
