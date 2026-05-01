import { Types, type HydratedDocument } from "mongoose";

import { emitPaymentWebhookEventForStatusChange } from "@/features/developers/developer-webhook-delivery.service";
import { assertMerchantKybApprovedForLive } from "@/features/kyc/kyc.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { PaymentModel } from "@/features/payments/payment.model";
import { PayoutModel, type PayoutDocument } from "@/features/payouts/payout.model";
import type {
  CreatePayoutInput,
  ListPayoutsQuery,
  UpdatePayoutInput,
} from "@/features/payouts/payout.validation";
import { executeDirectSolanaPayout } from "@/features/settlement/providers/direct/direct-solana.service";
import { executeUmbraPayout } from "@/features/settlement/providers/umbra/umbra.service";
import {
  SettlementRouteModel,
  type SettlementRouteRecord,
} from "@/features/settlement/settlement-route.model";
import { normalizeSolanaAddress } from "@/shared/constants/solana";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";
import { createRuntimeModeCondition, toStoredRuntimeMode } from "@/shared/utils/runtime-environment";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";

type PayoutRecord = HydratedDocument<PayoutDocument>;

function toPayoutResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  sourcePaymentId?: { toString(): string } | null;
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
    sourcePaymentId: document.sourcePaymentId?.toString() ?? null,
    batchRef: document.batchRef,
    sourceKind: document.sourceKind ?? "payment",
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

function resolvePaymentStatusFromPayout(
  payoutStatus: string
): "settling" | "settled" | "failed" {
  switch (payoutStatus) {
    case "queued":
    case "confirming":
      return "settling";
    case "settled":
      return "settled";
    default:
      return "failed";
  }
}

async function syncLinkedPaymentFromPayout(payout: {
  sourcePaymentId?: { toString(): string } | null;
  status: string;
}) {
  if (!payout.sourcePaymentId) {
    return;
  }

  const payment = await PaymentModel.findById(payout.sourcePaymentId).exec();

  if (!payment) {
    return;
  }

  const previousStatus = payment.status;
  const nextStatus = resolvePaymentStatusFromPayout(payout.status);
  payment.status = nextStatus;
  payment.collection.status = nextStatus;
  payment.collection.paidAt = nextStatus === "settled"
    ? payment.collection.paidAt ?? new Date()
    : payment.collection.paidAt;
  await payment.save();

  await emitPaymentWebhookEventForStatusChange({
    previousStatus,
    paymentId: payment._id.toString(),
    nextStatus: payment.status,
  }).catch(() => undefined);
}

async function resolvePayoutSettlementRoute(payout: {
  sourcePaymentId?: { toString(): string } | null;
}) {
  if (!payout.sourcePaymentId) {
    return null;
  }

  const payment = await PaymentModel.findById(payout.sourcePaymentId)
    .select({ settlementRouteId: 1 })
    .exec();

  if (!payment?.settlementRouteId) {
    return null;
  }

  const route = await SettlementRouteModel.findById(payment.settlementRouteId).exec();

  if (!route) {
    throw new HttpError(404, "Settlement route was not found.");
  }

  return route;
}

function toPayoutProcessingResult(payout: PayoutRecord, payoutReady: boolean) {
  return {
    payoutId: payout._id.toString(),
    status: payout.status,
    bridgeSourceTxHash: payout.bridgeSourceTxHash ?? null,
    bridgeReceiveTxHash: payout.bridgeReceiveTxHash ?? null,
    creditTxHash: payout.creditTxHash ?? null,
    payoutReady,
  };
}

async function processUmbraPayout(input: {
  payout: PayoutRecord;
  route: SettlementRouteRecord;
  runtimeEnvironment: RuntimeMode;
}) {
  const { payout, route, runtimeEnvironment } = input;
  const routeDestinationAddress = normalizeSolanaAddress(route.destinationAddress);
  const payoutDestinationAddress = normalizeSolanaAddress(payout.destinationWallet);

  if (!route.assetMint || !routeDestinationAddress) {
    throw new HttpError(409, "Umbra settlement route is not configured.");
  }

  if (payoutDestinationAddress !== routeDestinationAddress) {
    throw new HttpError(
      409,
      "Payout destination must match the selected settlement route."
    );
  }

  const execution = await executeUmbraPayout({
    payoutId: payout._id.toString(),
    merchantId: payout.merchantId.toString(),
    environment: runtimeEnvironment,
    routeId: route._id.toString(),
    amount: payout.netUsdc,
    assetSymbol: route.assetSymbol,
    assetMint: route.assetMint,
    assetDecimals: route.assetDecimals,
    destinationAddress: routeDestinationAddress,
  });

  payout.status = execution.status;
  payout.txHash = execution.txHash;
  payout.bridgeSourceTxHash = execution.createProofAccountTxHash;
  payout.bridgeReceiveTxHash = execution.closeProofAccountTxHash ?? null;
  payout.creditTxHash = execution.txHash;
  payout.bridgeAttestedAt = new Date();
  payout.submittedAt = payout.submittedAt ?? new Date();
  payout.settledAt = execution.settledAt;
  payout.reversalReason = null;
  await payout.save();

  await syncLinkedPaymentFromPayout(payout);

  return toPayoutProcessingResult(payout, true);
}

async function processDirectSolanaPayout(input: {
  payout: PayoutRecord;
  route: SettlementRouteRecord;
  runtimeEnvironment: RuntimeMode;
}) {
  const { payout, route, runtimeEnvironment } = input;
  const routeDestinationAddress = normalizeSolanaAddress(route.destinationAddress);
  const payoutDestinationAddress = normalizeSolanaAddress(payout.destinationWallet);

  if (!route.assetMint || !routeDestinationAddress) {
    throw new HttpError(409, "Direct Solana settlement route is not configured.");
  }

  if (payoutDestinationAddress !== routeDestinationAddress) {
    throw new HttpError(
      409,
      "Payout destination must match the selected settlement route."
    );
  }

  const execution = await executeDirectSolanaPayout({
    payoutId: payout._id.toString(),
    merchantId: payout.merchantId.toString(),
    environment: runtimeEnvironment,
    routeId: route._id.toString(),
    amount: payout.netUsdc,
    assetSymbol: route.assetSymbol,
    assetMint: route.assetMint,
    assetDecimals: route.assetDecimals,
    destinationAddress: routeDestinationAddress,
  });

  payout.status = execution.status;
  payout.txHash = execution.txHash;
  payout.bridgeSourceTxHash = null;
  payout.bridgeReceiveTxHash = null;
  payout.creditTxHash = execution.txHash;
  payout.bridgeAttestedAt = new Date();
  payout.submittedAt = payout.submittedAt ?? new Date();
  payout.settledAt = execution.settledAt;
  payout.reversalReason = null;
  await payout.save();

  await syncLinkedPaymentFromPayout(payout);

  return toPayoutProcessingResult(payout, true);
}

async function ensurePayoutScope(
  payoutId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const mongoQuery: Record<string, unknown> = {
    _id: payoutId,
  };

  if (merchantId) {
    mongoQuery.merchantId = merchantId;
  }

  if (environment) {
    Object.assign(mongoQuery, createRuntimeModeCondition("environment", environment));
  }

  const payout = await PayoutModel.findOne(mongoQuery).exec();

  if (!payout) {
    throw new HttpError(404, "Payout was not found.");
  }

  return payout;
}

export async function createPayout(input: CreatePayoutInput) {
  const merchantExists = await MerchantModel.exists({ _id: input.merchantId });

  if (!merchantExists) {
    throw new HttpError(404, "Merchant was not found.");
  }

  if (input.sourcePaymentId) {
    const sourcePayment = await PaymentModel.findOne({
      _id: input.sourcePaymentId,
      merchantId: input.merchantId,
      ...createRuntimeModeCondition("environment", input.environment),
    })
      .select({ settlementRouteId: 1 })
      .exec();

    if (!sourcePayment) {
      throw new HttpError(404, "Source payment was not found.");
    }

    if (sourcePayment.settlementRouteId) {
      const route = await SettlementRouteModel.findById(
        sourcePayment.settlementRouteId
      ).exec();

      if (!route) {
        throw new HttpError(404, "Settlement route was not found.");
      }

      const routeDestinationAddress = normalizeSolanaAddress(
        route.destinationAddress
      );
      const payoutDestinationAddress = normalizeSolanaAddress(
        input.destinationWallet
      );

      if (
        routeDestinationAddress &&
        payoutDestinationAddress !== routeDestinationAddress
      ) {
        throw new HttpError(
          409,
          "Payout destination must match the selected settlement route."
        );
      }
    }
  }

  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "creating payouts",
    input.environment
  );

  const payout = await PayoutModel.create({
    merchantId: input.merchantId,
    environment: input.environment,
    sourcePaymentId: input.sourcePaymentId ?? null,
    batchRef: input.batchRef,
    sourceKind: "payment",
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

  await syncLinkedPaymentFromPayout(payout);

  return toPayoutResponse(payout);
}

export async function listPayouts(query: ListPayoutsQuery) {
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

  const payouts = await PayoutModel.find(mongoQuery)
    .sort({ scheduledFor: -1 })
    .exec();

  return payouts.map(toPayoutResponse);
}

export async function getPayoutById(
  payoutId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const payout = await ensurePayoutScope(
    payoutId,
    merchantId,
    environment
  );

  return toPayoutResponse(payout);
}

export async function updatePayout(
  payoutId: string,
  input: UpdatePayoutInput,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const payout = await ensurePayoutScope(
    payoutId,
    merchantId,
    environment
  );

  await assertMerchantKybApprovedForLive(
    payout.merchantId.toString(),
    "updating payouts",
    toStoredRuntimeMode(payout.environment)
  );

  if (input.status !== undefined) {
    payout.status = input.status;
  }

  if (input.sourceKind !== undefined) {
    payout.sourceKind = input.sourceKind;
  }

  if (input.commercialRef !== undefined) {
    payout.commercialRef = input.commercialRef ?? null;
  }

  if (input.localAmount !== undefined) {
    payout.localAmount = input.localAmount ?? null;
  }

  if (input.fxRate !== undefined) {
    payout.fxRate = input.fxRate ?? null;
  }

  if (input.txHash !== undefined) {
    payout.txHash = input.txHash ?? null;
  }

  if (input.bridgeSourceTxHash !== undefined) {
    payout.bridgeSourceTxHash = input.bridgeSourceTxHash ?? null;
  }

  if (input.bridgeReceiveTxHash !== undefined) {
    payout.bridgeReceiveTxHash = input.bridgeReceiveTxHash ?? null;
  }

  if (input.creditTxHash !== undefined) {
    payout.creditTxHash = input.creditTxHash ?? null;
  }

  if (input.submittedAt !== undefined) {
    payout.submittedAt = input.submittedAt ?? null;
  }

  if (input.bridgeAttestedAt !== undefined) {
    payout.bridgeAttestedAt = input.bridgeAttestedAt ?? null;
  }

  if (input.sourcePaymentId !== undefined) {
    payout.sourcePaymentId = input.sourcePaymentId
      ? new Types.ObjectId(input.sourcePaymentId)
      : null;
  }

  if (input.scheduledFor !== undefined) {
    payout.scheduledFor = input.scheduledFor;
  }

  if (input.settledAt !== undefined) {
    payout.settledAt = input.settledAt ?? null;
  }

  if (input.reversedAt !== undefined) {
    payout.reversedAt = input.reversedAt ?? null;
  }

  if (input.reversalReason !== undefined) {
    payout.reversalReason = input.reversalReason ?? null;
  }

  if (payout.status === "confirming" && !payout.submittedAt) {
    payout.submittedAt = new Date();
  }

  if (payout.status === "settled" && !payout.settledAt) {
    payout.settledAt = new Date();
  }

  if (payout.status === "reversed" && !payout.reversedAt) {
    payout.reversedAt = new Date();
  }

  await payout.save();

  await syncLinkedPaymentFromPayout(payout);

  return toPayoutResponse(payout);
}

export async function queuePayoutProcessing(
  payoutId: string,
  options?: {
    merchantId?: string;
    environment?: RuntimeMode;
  }
) {
  const payout = await ensurePayoutScope(
    payoutId,
    options?.merchantId,
    options?.environment
  );

  await assertMerchantKybApprovedForLive(
    payout.merchantId.toString(),
    "processing payouts",
    toStoredRuntimeMode(payout.environment)
  );

  if (
    payout.status === "settled" ||
    payout.status === "reversed" ||
    payout.creditTxHash
  ) {
    return {
      queued: false,
      processedInline: false,
      payoutId,
      result: {
        skipped: true,
        status: payout.status,
      },
    };
  }

  if (toStoredRuntimeMode(payout.environment) === "test") {
    console.log(
      `[payout-processing] inline-start ${JSON.stringify({
        payoutId,
        environment: "test",
        merchantId: payout.merchantId.toString(),
      })}`
    );
    const inlineResult = await runPayoutProcessingJob({ payoutId });

    return {
      queued: false,
      processedInline: true,
      payoutId,
      result: inlineResult,
    };
  }

  const queuedJob = await enqueueQueueJob(
    queueNames.payoutProcessing,
    "payout-processing",
    { payoutId },
    {
      jobId: `payout-processing-${payoutId}`,
      attempts: 3,
    }
  );

  if (!queuedJob) {
    console.log(
      `[payout-processing] inline-start ${JSON.stringify({
        payoutId,
        environment: options?.environment ?? null,
        merchantId: options?.merchantId ?? null,
      })}`
    );
    const inlineResult = await runPayoutProcessingJob({ payoutId });

    return {
      queued: false,
      processedInline: true,
      payoutId,
      result: inlineResult,
    };
  }

  console.log(
    `[payout-processing] queued ${JSON.stringify({
      payoutId,
      environment: options?.environment ?? null,
      merchantId: options?.merchantId ?? null,
    })}`
  );

  return {
    queued: true,
    payoutId,
  };
}

export async function runPayoutProcessingJob(input: { payoutId: string }) {
  console.log(
    `[payout-processing] run-start ${JSON.stringify({
      payoutId: input.payoutId,
    })}`
  );
  const payout = await PayoutModel.findById(input.payoutId).exec();

  if (!payout) {
    throw new HttpError(404, "Payout was not found.");
  }

  if (payout.creditTxHash) {
    return {
      payoutId: input.payoutId,
      status: payout.status,
      bridgeSourceTxHash: payout.bridgeSourceTxHash ?? null,
      bridgeReceiveTxHash: payout.bridgeReceiveTxHash ?? null,
      creditTxHash: payout.creditTxHash ?? null,
      payoutReady: payout.status === "confirming",
    };
  }

  const merchant = await MerchantModel.findById(payout.merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  const runtimeEnvironment = toStoredRuntimeMode(payout.environment);
  const settlementRoute = await resolvePayoutSettlementRoute(payout);

  if (settlementRoute?.provider === "umbra") {
    return processUmbraPayout({
      payout,
      route: settlementRoute,
      runtimeEnvironment,
    });
  }

  if (
    settlementRoute?.provider === "direct" &&
    settlementRoute.chain === "solana"
  ) {
    return processDirectSolanaPayout({
      payout,
      route: settlementRoute,
      runtimeEnvironment,
    });
  }

  payout.status = "failed";
  payout.bridgeSourceTxHash = null;
  payout.bridgeReceiveTxHash = null;
  payout.creditTxHash = null;
  payout.bridgeAttestedAt = null;
  payout.submittedAt = payout.submittedAt ?? new Date();
  payout.settledAt = null;
  payout.reversalReason = "Unsupported settlement route for automated payout.";
  await payout.save();

  await syncLinkedPaymentFromPayout(payout);

  console.log(
    `[payout-processing] unsupported-route ${JSON.stringify({
      payoutId: input.payoutId,
      status: payout.status,
      routeId: settlementRoute?._id.toString() ?? null,
      provider: settlementRoute?.provider ?? null,
      chain: settlementRoute?.chain ?? null,
    })}`
  );

  return toPayoutProcessingResult(payout, false);
}
