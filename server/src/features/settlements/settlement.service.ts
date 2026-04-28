import { Types } from "mongoose";

import { HttpError } from "@/shared/errors/http-error";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";

import { ChargeModel } from "@/features/charges/charge.model";
import { emitChargeWebhookEventForStatusChange } from "@/features/developers/developer-webhook-delivery.service";
import { InvoiceModel } from "@/features/invoices/invoice.model";
import { queueChargeStatusNotifications } from "@/features/notifications/notification.service";
import { assertMerchantKybApprovedForLive } from "@/features/kyc/kyc.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { SettlementModel } from "@/features/settlements/settlement.model";
import type {
  CreateSettlementInput,
  ListSettlementsQuery,
  UpdateSettlementInput,
} from "@/features/settlements/settlement.validation";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { createRuntimeModeCondition, toStoredRuntimeMode } from "@/shared/utils/runtime-environment";
import { normalizeSolanaAddress } from "@/shared/constants/solana";

function toSettlementResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  sourceChargeId?: { toString(): string } | null;
  batchRef: string;
  sourceKind?: string | null;
  commercialRef?: string | null;
  localAmount?: number | null;
  fxRate?: number | null;
  grossUsdc: number;
  feeUsdc: number;
  netUsdc: number;
  destinationWallet: string;
  status: string;
  txHash?: string | null;
  bridgeSourceTxHash?: string | null;
  bridgeReceiveTxHash?: string | null;
  creditTxHash?: string | null;
  submittedAt?: Date | null;
  bridgeAttestedAt?: Date | null;
  scheduledFor: Date;
  settledAt?: Date | null;
  reversedAt?: Date | null;
  reversalReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    sourceChargeId: document.sourceChargeId?.toString() ?? null,
    batchRef: document.batchRef,
    sourceKind: document.sourceKind ?? "subscription",
    commercialRef: document.commercialRef ?? null,
    localAmount: document.localAmount ?? null,
    fxRate: document.fxRate ?? null,
    grossUsdc: document.grossUsdc,
    feeUsdc: document.feeUsdc,
    netUsdc: document.netUsdc,
    destinationWallet: document.destinationWallet,
    status: document.status,
    txHash: document.txHash ?? null,
    bridgeSourceTxHash: document.bridgeSourceTxHash ?? null,
    bridgeReceiveTxHash: document.bridgeReceiveTxHash ?? null,
    creditTxHash: document.creditTxHash ?? null,
    submittedAt: document.submittedAt ?? null,
    bridgeAttestedAt: document.bridgeAttestedAt ?? null,
    scheduledFor: document.scheduledFor,
    settledAt: document.settledAt ?? null,
    reversedAt: document.reversedAt ?? null,
    reversalReason: document.reversalReason ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function resolveChargeStatusFromSettlement(
  settlementStatus: string
): "awaiting_settlement" | "confirming" | "settled" | "failed" | "reversed" {
  switch (settlementStatus) {
    case "queued":
      return "awaiting_settlement";
    case "confirming":
      return "confirming";
    case "settled":
      return "settled";
    case "reversed":
      return "reversed";
    default:
      return "failed";
  }
}

async function syncLinkedChargeFromSettlement(settlement: {
  sourceChargeId?: { toString(): string } | null;
  status: string;
}) {
  if (!settlement.sourceChargeId) {
    return;
  }

  const charge = await ChargeModel.findById(settlement.sourceChargeId).exec();

  if (!charge) {
    return;
  }

  const nextStatus = resolveChargeStatusFromSettlement(settlement.status);
  const failureCode =
    nextStatus === "failed"
      ? "settlement_failed"
      : nextStatus === "reversed"
        ? "settlement_reversed"
        : null;

  const previousStatus = charge.status;

  charge.status = nextStatus;
  charge.failureCode = failureCode;
  charge.processedAt = new Date();
  await charge.save();

  if (charge.invoiceId) {
    const invoice = await InvoiceModel.findById(charge.invoiceId).exec();

    if (invoice) {
      if (nextStatus === "settled") {
        invoice.status = "paid";
        invoice.paidAt = invoice.paidAt ?? charge.processedAt ?? new Date();
      } else if (nextStatus === "awaiting_settlement" || nextStatus === "confirming") {
        invoice.status = "processing";
      } else if (nextStatus === "failed" || nextStatus === "reversed") {
        invoice.status = invoice.dueDate.getTime() < Date.now() ? "overdue" : "issued";
      }

      if (invoice.paymentSnapshot) {
        invoice.paymentSnapshot.status = charge.status;
      }

      await invoice.save();
    }
  }

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
}

async function ensureSettlementScope(
  settlementId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const mongoQuery: Record<string, unknown> = {
    _id: settlementId,
  };

  if (merchantId) {
    mongoQuery.merchantId = merchantId;
  }

  if (environment) {
    Object.assign(mongoQuery, createRuntimeModeCondition("environment", environment));
  }

  const settlement = await SettlementModel.findOne(mongoQuery).exec();

  if (!settlement) {
    throw new HttpError(404, "Settlement was not found.");
  }

  return settlement;
}

export async function createSettlement(input: CreateSettlementInput) {
  const merchantExists = await MerchantModel.exists({ _id: input.merchantId });

  if (!merchantExists) {
    throw new HttpError(404, "Merchant was not found.");
  }

  if (input.sourceChargeId) {
    const sourceChargeExists = await ChargeModel.exists({
      _id: input.sourceChargeId,
      merchantId: input.merchantId,
      ...createRuntimeModeCondition("environment", input.environment),
    });

    if (!sourceChargeExists) {
      throw new HttpError(404, "Source charge was not found.");
    }
  }

  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "creating settlements",
    input.environment
  );

  const settlement = await SettlementModel.create({
    merchantId: input.merchantId,
    environment: input.environment,
    sourceChargeId: input.sourceChargeId ?? null,
    batchRef: input.batchRef,
    sourceKind: input.sourceKind ?? (input.sourceChargeId ? "subscription" : "invoice"),
    commercialRef: input.commercialRef ?? null,
    localAmount: input.localAmount ?? null,
    fxRate: input.fxRate ?? null,
    grossUsdc: input.grossUsdc,
    feeUsdc: input.feeUsdc,
    netUsdc: input.netUsdc,
    destinationWallet: normalizeSolanaAddress(input.destinationWallet) ?? input.destinationWallet,
    status: input.status,
    txHash: input.txHash ?? null,
    bridgeSourceTxHash: input.bridgeSourceTxHash ?? null,
    bridgeReceiveTxHash: input.bridgeReceiveTxHash ?? null,
    creditTxHash: input.creditTxHash ?? null,
    submittedAt: input.submittedAt ?? null,
    scheduledFor: input.scheduledFor,
    settledAt: input.settledAt ?? null,
    reversedAt: input.reversedAt ?? null,
    reversalReason: input.reversalReason ?? null,
  });

  await syncLinkedChargeFromSettlement(settlement);

  return toSettlementResponse(settlement);
}

export async function listSettlements(query: ListSettlementsQuery) {
  const filters: Record<string, unknown>[] = [];

  if (query.merchantId) {
    filters.push({
      merchantId: query.merchantId,
    });
  }

  if (query.environment) {
    filters.push(createRuntimeModeCondition("environment", query.environment));
  }

  if (query.status) {
    filters.push({
      status: query.status,
    });
  }

  if (query.search) {
    const pattern = new RegExp(query.search, "i");
    filters.push({
      batchRef: pattern,
    });
  }

  const mongoQuery =
    filters.length === 0
      ? {}
      : filters.length === 1
        ? filters[0]
        : { $and: filters };

  const settlements = await SettlementModel.find(mongoQuery)
    .sort({ scheduledFor: -1 })
    .exec();

  return settlements.map(toSettlementResponse);
}

export async function getSettlementById(
  settlementId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const settlement = await ensureSettlementScope(
    settlementId,
    merchantId,
    environment
  );

  return toSettlementResponse(settlement);
}

export async function updateSettlement(
  settlementId: string,
  input: UpdateSettlementInput,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const settlement = await ensureSettlementScope(
    settlementId,
    merchantId,
    environment
  );

  await assertMerchantKybApprovedForLive(
    settlement.merchantId.toString(),
    "updating settlements",
    toStoredRuntimeMode(settlement.environment)
  );

  if (input.status !== undefined) {
    settlement.status = input.status;
  }

  if (input.sourceKind !== undefined) {
    settlement.sourceKind = input.sourceKind;
  }

  if (input.commercialRef !== undefined) {
    settlement.commercialRef = input.commercialRef ?? null;
  }

  if (input.localAmount !== undefined) {
    settlement.localAmount = input.localAmount ?? null;
  }

  if (input.fxRate !== undefined) {
    settlement.fxRate = input.fxRate ?? null;
  }

  if (input.txHash !== undefined) {
    settlement.txHash = input.txHash ?? null;
  }

  if (input.bridgeSourceTxHash !== undefined) {
    settlement.bridgeSourceTxHash = input.bridgeSourceTxHash ?? null;
  }

  if (input.bridgeReceiveTxHash !== undefined) {
    settlement.bridgeReceiveTxHash = input.bridgeReceiveTxHash ?? null;
  }

  if (input.creditTxHash !== undefined) {
    settlement.creditTxHash = input.creditTxHash ?? null;
  }

  if (input.submittedAt !== undefined) {
    settlement.submittedAt = input.submittedAt ?? null;
  }

  if (input.bridgeAttestedAt !== undefined) {
    settlement.bridgeAttestedAt = input.bridgeAttestedAt ?? null;
  }

  if (input.sourceChargeId !== undefined) {
    settlement.sourceChargeId = input.sourceChargeId
      ? new Types.ObjectId(input.sourceChargeId)
      : null;
  }

  if (input.scheduledFor !== undefined) {
    settlement.scheduledFor = input.scheduledFor;
  }

  if (input.settledAt !== undefined) {
    settlement.settledAt = input.settledAt ?? null;
  }

  if (input.reversedAt !== undefined) {
    settlement.reversedAt = input.reversedAt ?? null;
  }

  if (input.reversalReason !== undefined) {
    settlement.reversalReason = input.reversalReason ?? null;
  }

  if (settlement.status === "confirming" && !settlement.submittedAt) {
    settlement.submittedAt = new Date();
  }

  if (settlement.status === "settled" && !settlement.settledAt) {
    settlement.settledAt = new Date();
  }

  if (settlement.status === "reversed" && !settlement.reversedAt) {
    settlement.reversedAt = new Date();
  }

  await settlement.save();

  await syncLinkedChargeFromSettlement(settlement);

  return toSettlementResponse(settlement);
}

export async function queueSettlementBridge(
  settlementId: string,
  options?: {
    merchantId?: string;
    environment?: RuntimeMode;
  }
) {
  const settlement = await ensureSettlementScope(
    settlementId,
    options?.merchantId,
    options?.environment
  );

  await assertMerchantKybApprovedForLive(
    settlement.merchantId.toString(),
    "bridging settlements",
    toStoredRuntimeMode(settlement.environment)
  );

  if (
    settlement.status === "settled" ||
    settlement.status === "reversed" ||
    settlement.creditTxHash
  ) {
    return {
      queued: false,
      processedInline: false,
      settlementId,
      result: {
        skipped: true,
        status: settlement.status,
      },
    };
  }

  if (toStoredRuntimeMode(settlement.environment) === "test") {
    console.log(
      `[settlement-bridge] inline-start ${JSON.stringify({
        settlementId,
        environment: "test",
        merchantId: settlement.merchantId.toString(),
      })}`
    );
    const inlineResult = await runSettlementBridgeJob({ settlementId });

    return {
      queued: false,
      processedInline: true,
      settlementId,
      result: inlineResult,
    };
  }

  const queuedJob = await enqueueQueueJob(
    queueNames.settlementBridge,
    "settlement-bridge",
    { settlementId },
    {
      jobId: `settlement-bridge-${settlementId}`,
      attempts: 3,
    }
  );

  if (!queuedJob) {
    console.log(
      `[settlement-bridge] inline-start ${JSON.stringify({
        settlementId,
        environment: options?.environment ?? null,
        merchantId: options?.merchantId ?? null,
      })}`
    );
    const inlineResult = await runSettlementBridgeJob({ settlementId });

    return {
      queued: false,
      processedInline: true,
      settlementId,
      result: inlineResult,
    };
  }

  console.log(
    `[settlement-bridge] queued ${JSON.stringify({
      settlementId,
      environment: options?.environment ?? null,
      merchantId: options?.merchantId ?? null,
    })}`
  );

  return {
    queued: true,
    settlementId,
  };
}

export async function runSettlementBridgeJob(input: { settlementId: string }) {
  console.log(
    `[settlement-bridge] run-start ${JSON.stringify({
      settlementId: input.settlementId,
    })}`
  );
  const settlement = await SettlementModel.findById(input.settlementId).exec();

  if (!settlement) {
    throw new HttpError(404, "Settlement was not found.");
  }

  if (settlement.creditTxHash) {
    return {
      settlementId: input.settlementId,
      status: settlement.status,
      bridgeSourceTxHash: settlement.bridgeSourceTxHash ?? null,
      bridgeReceiveTxHash: settlement.bridgeReceiveTxHash ?? null,
      creditTxHash: settlement.creditTxHash ?? null,
      payoutReady: settlement.status === "confirming",
    };
  }

  const merchant = await MerchantModel.findById(settlement.merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  const runtimeEnvironment = toStoredRuntimeMode(settlement.environment);
  const postExecutionStatus = runtimeEnvironment === "test" ? "settled" : "confirming";

  settlement.status = postExecutionStatus;
  settlement.bridgeSourceTxHash = null;
  settlement.bridgeReceiveTxHash = null;
  settlement.creditTxHash = null;
  settlement.bridgeAttestedAt = new Date();
  settlement.submittedAt = settlement.submittedAt ?? new Date();
  settlement.settledAt = postExecutionStatus === "settled" ? new Date() : null;
  await settlement.save();

  await syncLinkedChargeFromSettlement(settlement);

  console.log(
    `[settlement-bridge] run-complete ${JSON.stringify({
      settlementId: input.settlementId,
      status: settlement.status,
      bridgeSourceTxHash: settlement.bridgeSourceTxHash,
      bridgeReceiveTxHash: settlement.bridgeReceiveTxHash,
      creditTxHash: settlement.creditTxHash,
    })}`
  );

  return {
    settlementId: input.settlementId,
    status: settlement.status,
    bridgeSourceTxHash: settlement.bridgeSourceTxHash,
    bridgeReceiveTxHash: settlement.bridgeReceiveTxHash,
    creditTxHash: settlement.creditTxHash,
    payoutReady: true,
  };
}
