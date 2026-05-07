import { randomBytes } from "crypto";

import { HttpError } from "@/shared/errors/http-error";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";
import { toPublicEnvironment } from "@/shared/utils/runtime-environment";

import { DeveloperDeliveryModel } from "@/features/developers/developer-delivery.model";
import {
  decryptWebhookSecret,
  signDeveloperWebhookPayload,
} from "@/features/developers/developer-webhook-crypto";
import type { DeveloperWebhookEventName } from "@/features/developers/developer-webhook-events";
import { DeveloperWebhookModel } from "@/features/developers/developer-webhook.model";
import { PaymentModel } from "@/features/payments/payment.model";
import { PayoutModel } from "@/features/payouts/payout.model";

type DeveloperWebhookPayload = {
  id: string;
  eventType: DeveloperWebhookEventName;
  createdAt: string;
  environment: "sandbox" | "live";
  livemode: boolean;
  data: Record<string, unknown>;
};

type CreateDeliveryInput = {
  merchantId: string;
  environment: RuntimeMode;
  webhookId: string;
  eventId: string;
  eventType: DeveloperWebhookEventName;
  payload: DeveloperWebhookPayload;
};

type DeliveryJobInput = {
  deliveryId: string;
  attempt: number;
};

const retrySchedules: Record<string, number[]> = {
  none: [],
  linear: [60_000, 120_000, 180_000],
  exponential: [60_000, 300_000, 900_000],
};

function truncateMessage(value: string | null | undefined, maxLength = 500) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function createEventId(prefix: string) {
  return `evt_${prefix}_${randomBytes(8).toString("hex")}`;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

async function createDelivery(input: CreateDeliveryInput) {
  try {
    return await DeveloperDeliveryModel.create({
      merchantId: input.merchantId,
      environment: input.environment,
      webhookId: input.webhookId,
      eventId: input.eventId,
      eventType: input.eventType,
      status: "queued",
      attempts: 0,
      httpStatus: null,
      payload: input.payload,
      errorMessage: null,
      deliveredAt: null,
    });
  } catch (error) {
    const duplicateKeyError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      Number((error as { code?: number }).code) === 11000;

    if (!duplicateKeyError) {
      throw error;
    }

    return DeveloperDeliveryModel.findOne({
      webhookId: input.webhookId,
      eventId: input.eventId,
    }).exec();
  }
}

async function queueDeliveryJob(
  deliveryId: string,
  attempt: number,
  delayMs = 0
) {
  const queuedJob = await enqueueQueueJob(
    queueNames.developerWebhookDelivery,
    "developer-webhook-delivery",
    {
      deliveryId,
      attempt,
    } satisfies DeliveryJobInput,
    {
      attempts: 1,
      delayMs,
      jobId: `developer-webhook-delivery-${deliveryId}-attempt-${attempt}`,
    }
  );

  if (!queuedJob && delayMs > 0) {
    return "unavailable" as const;
  }

  if (!queuedJob) {
    await runDeveloperWebhookDeliveryJob({
      deliveryId,
      attempt,
    });

    return "inline" as const;
  }

  return "queued" as const;
}

async function createDeliveryAndDispatch(input: CreateDeliveryInput) {
  const delivery = await createDelivery(input);

  if (!delivery) {
    return null;
  }

  if (delivery.status === "delivered") {
    return delivery;
  }

  await queueDeliveryJob(delivery._id.toString(), 1);

  return DeveloperDeliveryModel.findById(delivery._id).exec();
}

async function buildPaymentWebhookPayload(input: {
  paymentId: string;
  eventType: DeveloperWebhookEventName;
  eventId: string;
}) {
  const payment = await PaymentModel.findById(input.paymentId).exec();

  if (!payment) {
    throw new HttpError(404, "Payment was not found for webhook dispatch.");
  }

  const settlement = await PayoutModel.findOne({ sourcePaymentId: payment._id })
    .sort({ createdAt: -1 })
    .select({
      _id: 1,
      batchRef: 1,
      grossUsdc: 1,
      feeUsdc: 1,
      netUsdc: 1,
      destinationWallet: 1,
      status: 1,
      txHash: 1,
      bridgeSourceTxHash: 1,
      bridgeReceiveTxHash: 1,
      creditTxHash: 1,
      submittedAt: 1,
      bridgeAttestedAt: 1,
      scheduledFor: 1,
      settledAt: 1,
      reversedAt: 1,
      reversalReason: 1,
    })
    .lean()
    .exec();
  const environment: RuntimeMode =
    payment.environment === "live" ? "live" : "test";
  const metadata = asRecord(payment.metadata);
  const reference = readString(metadata.reference) ?? payment.payId;

  return {
    merchantId: payment.merchantId.toString(),
    environment,
    payload: {
      id: input.eventId,
      eventType: input.eventType,
      createdAt: new Date().toISOString(),
      environment: toPublicEnvironment(environment),
      livemode: environment === "live",
      data: {
        collection: {
          id: payment.payId,
          paymentId: payment._id.toString(),
          reference,
          amount: payment.amount,
          currency: payment.currency,
          description: payment.description,
          recurring: payment.recurring?.enabled ?? false,
          status:
            payment.status === "open"
              ? "created"
              : payment.status === "pending"
                ? "collecting"
                : payment.status === "failed" || payment.status === "cancelled"
                  ? payment.status
                  : "paid",
          checkoutUrl: payment.paymentUrl,
          paidAt: payment.collection.paidAt ?? null,
          metadata,
        },
        payment: {
          id: payment._id.toString(),
          payId: payment.payId,
          customerId: payment.customerId?.toString() ?? null,
          settlementRouteId: payment.settlementRouteId?.toString() ?? null,
          amount: payment.amount,
          currency: payment.currency,
          description: payment.description,
          recurring: payment.recurring?.enabled ?? false,
          status: payment.status,
          provider: payment.collection.provider,
          externalId: payment.collection.externalId ?? null,
          localAmount: payment.collection.localAmount ?? null,
          fxRate: payment.collection.fxRate ?? null,
          stableAmount: payment.collection.stableAmount ?? null,
          feeAmount: payment.collection.feeAmount ?? null,
          paidAt: payment.collection.paidAt ?? null,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
        settlement: settlement
          ? {
              id: settlement._id.toString(),
              batchRef: settlement.batchRef,
              grossUsdc: settlement.grossUsdc,
              feeUsdc: settlement.feeUsdc,
              netUsdc: settlement.netUsdc,
              destinationWallet: settlement.destinationWallet,
              status: settlement.status,
              txHash: settlement.txHash ?? null,
              bridgeSourceTxHash: settlement.bridgeSourceTxHash ?? null,
              bridgeReceiveTxHash: settlement.bridgeReceiveTxHash ?? null,
              creditTxHash: settlement.creditTxHash ?? null,
              submittedAt: settlement.submittedAt ?? null,
              bridgeAttestedAt: settlement.bridgeAttestedAt ?? null,
              scheduledFor: settlement.scheduledFor,
              settledAt: settlement.settledAt ?? null,
              reversedAt: settlement.reversedAt ?? null,
              reversalReason: settlement.reversalReason ?? null,
            }
          : null,
      },
    } satisfies DeveloperWebhookPayload,
  };
}

function createTestWebhookPayload(input: {
  merchantId: string;
  environment: RuntimeMode;
  eventType: DeveloperWebhookEventName;
}) {
  const eventId = createEventId("test");
  const now = new Date();

  return {
    eventId,
    payload: {
      id: eventId,
      eventType: input.eventType,
      createdAt: now.toISOString(),
      environment: toPublicEnvironment(input.environment),
      livemode: input.environment === "live",
      data: {
        mode: "test_delivery",
        merchantId: input.merchantId,
        collection: {
          id: `col_${randomBytes(6).toString("hex")}`,
          paymentId: `test_payment_${randomBytes(6).toString("hex")}`,
          reference: "order_test",
          externalId: `partna_${randomBytes(4).toString("hex")}`,
          status: input.eventType === "collection.failed" ? "failed" : "paid",
          amount: 120000,
          currency: "NGN",
          description: "Test collection",
          recurring: false,
          localAmount: 120000,
          fxRate: 1600,
          stableAmount: 75,
          feeAmount: 1.5,
          paidAt: now.toISOString(),
        },
        settlement:
          input.eventType === "settlement.settled"
            ? {
                id: `test_settlement_${randomBytes(6).toString("hex")}`,
                status: "settled",
                grossUsdc: 75,
                feeUsdc: 1.5,
                netUsdc: 73.5,
                destinationWallet: "0x0000000000000000000000000000000000000000",
                settledAt: now.toISOString(),
              }
            : null,
      },
    } satisfies DeveloperWebhookPayload,
  };
}

export async function enqueueDeveloperWebhookEvent(input: {
  merchantId: string;
  environment: RuntimeMode;
  eventId: string;
  eventType: DeveloperWebhookEventName;
  payload: DeveloperWebhookPayload;
}) {
  const webhooks = await DeveloperWebhookModel.find({
    merchantId: input.merchantId,
    environment: input.environment,
    status: "active",
    eventTypes: input.eventType,
  }).exec();

  const deliveries = await Promise.all(
    webhooks.map((webhook) =>
      createDeliveryAndDispatch({
        merchantId: input.merchantId,
        environment: input.environment,
        webhookId: webhook._id.toString(),
        eventId: input.eventId,
        eventType: input.eventType,
        payload: input.payload,
      })
    )
  );

  return deliveries.filter(
    (
      delivery
    ): delivery is NonNullable<(typeof deliveries)[number]> => Boolean(delivery)
  );
}

export async function emitPaymentWebhookEvent(input: {
  paymentId: string;
  eventType: DeveloperWebhookEventName;
  eventId?: string;
}) {
  const eventId =
    input.eventId ??
    createEventId(`${input.eventType.replace(/\./g, "_")}_${input.paymentId}`);
  const payload = await buildPaymentWebhookPayload({
    paymentId: input.paymentId,
    eventType: input.eventType,
    eventId,
  });

  return enqueueDeveloperWebhookEvent({
    merchantId: payload.merchantId,
    environment: payload.environment,
    eventId,
    eventType: input.eventType,
    payload: payload.payload,
  });
}

export async function emitPaymentWebhookEventForStatusChange(input: {
  previousStatus?: string | null;
  paymentId: string;
  nextStatus: string;
}) {
  if (input.nextStatus === input.previousStatus) {
    return [];
  }

  if (input.nextStatus === "failed") {
    return emitPaymentWebhookEvent({
      paymentId: input.paymentId,
      eventType: ["paid", "settling", "settled"].includes(input.previousStatus ?? "")
        ? "settlement.failed"
        : "collection.failed",
      eventId: ["paid", "settling", "settled"].includes(input.previousStatus ?? "")
        ? `evt_settlement_${input.paymentId}_failed`
        : `evt_collection_${input.paymentId}_failed`,
    });
  }

  if (
    ["paid", "settling", "settled"].includes(input.nextStatus) &&
    !["paid", "settling", "settled"].includes(input.previousStatus ?? "")
  ) {
    return emitPaymentWebhookEvent({
      paymentId: input.paymentId,
      eventType: "collection.paid",
      eventId: `evt_collection_${input.paymentId}_paid`,
    });
  }

  if (input.nextStatus === "settled") {
    return emitPaymentWebhookEvent({
      paymentId: input.paymentId,
      eventType: "settlement.settled",
      eventId: `evt_settlement_${input.paymentId}_settled`,
    });
  }

  return [];
}

export async function sendDeveloperWebhookTest(input: {
  merchantId: string;
  environment: RuntimeMode;
  webhookId: string;
  eventType: DeveloperWebhookEventName;
}) {
  const webhook = await DeveloperWebhookModel.findOne({
    _id: input.webhookId,
    merchantId: input.merchantId,
    environment: input.environment,
  }).exec();

  if (!webhook) {
    throw new HttpError(404, "Webhook endpoint was not found.");
  }

  const { eventId, payload } = createTestWebhookPayload({
    merchantId: input.merchantId,
    environment: input.environment,
    eventType: input.eventType,
  });
  const delivery = await createDeliveryAndDispatch({
    merchantId: input.merchantId,
    environment: input.environment,
    webhookId: webhook._id.toString(),
    eventId,
    eventType: input.eventType,
    payload,
  });

  if (!delivery) {
    throw new HttpError(409, "Webhook test delivery already exists.");
  }

  return delivery;
}

export async function runDeveloperWebhookDeliveryJob(input: DeliveryJobInput) {
  const delivery = await DeveloperDeliveryModel.findById(input.deliveryId).exec();

  if (!delivery) {
    throw new HttpError(404, "Webhook delivery was not found.");
  }

  if (delivery.status === "delivered") {
    return {
      deliveryId: input.deliveryId,
      status: delivery.status,
      attempts: delivery.attempts,
    };
  }

  const webhook = await DeveloperWebhookModel.findById(delivery.webhookId).exec();

  if (!webhook) {
    delivery.status = "failed";
    delivery.attempts = input.attempt;
    delivery.errorMessage = "Webhook endpoint no longer exists.";
    delivery.httpStatus = null;
    await delivery.save();

    return {
      deliveryId: input.deliveryId,
      status: delivery.status,
      attempts: delivery.attempts,
    };
  }

  if (webhook.status !== "active") {
    delivery.status = "failed";
    delivery.attempts = input.attempt;
    delivery.errorMessage = "Webhook endpoint is disabled.";
    delivery.httpStatus = null;
    await delivery.save();

    return {
      deliveryId: input.deliveryId,
      status: delivery.status,
      attempts: delivery.attempts,
    };
  }

  const payloadText = JSON.stringify(delivery.payload ?? {});
  const signedPayload = signDeveloperWebhookPayload({
    payload: payloadText,
    signingSecret: decryptWebhookSecret(webhook.secretCiphertext),
  });

  let deliveredAt: Date | null = null;
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;
  let shouldRetry = false;

  try {
    const response = await fetch(webhook.endpointUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Renew-Webhooks/1.0",
        "x-renew-event": delivery.eventType,
        "x-renew-delivery-id": delivery._id.toString(),
        ...signedPayload.headers,
      },
      body: payloadText,
      signal: AbortSignal.timeout(10_000),
    });

    httpStatus = response.status;

    if (response.ok) {
      deliveredAt = new Date();
    } else {
      errorMessage = truncateMessage(await response.text());
      shouldRetry = true;
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? truncateMessage(error.message) : "Webhook delivery failed.";
    shouldRetry = true;
  }

  delivery.attempts = input.attempt;
  delivery.httpStatus = httpStatus;
  delivery.errorMessage = errorMessage;

  if (deliveredAt) {
    delivery.status = "delivered";
    delivery.deliveredAt = deliveredAt;
    await delivery.save();

    webhook.lastDeliveryAt = deliveredAt;
    await webhook.save();

    return {
      deliveryId: input.deliveryId,
      status: delivery.status,
      attempts: delivery.attempts,
      httpStatus,
    };
  }

  const retrySchedule = retrySchedules[webhook.retryPolicy] ?? retrySchedules.exponential;
  const nextDelayMs = retrySchedule[input.attempt - 1] ?? null;

  if (shouldRetry && nextDelayMs !== null) {
    delivery.status = "queued";
    delivery.deliveredAt = null;
    await delivery.save();
    const retryDisposition = await queueDeliveryJob(
      input.deliveryId,
      input.attempt + 1,
      nextDelayMs
    );

    if (retryDisposition === "unavailable") {
      delivery.status = "failed";
      delivery.errorMessage =
        truncateMessage(errorMessage) ??
        "Webhook retry queue is unavailable.";
      await delivery.save();
    }
  } else {
    delivery.status = "failed";
    delivery.deliveredAt = null;
    await delivery.save();
  }

  return {
    deliveryId: input.deliveryId,
    status: delivery.status,
    attempts: delivery.attempts,
    httpStatus,
    errorMessage,
  };
}
