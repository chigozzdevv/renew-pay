import { Types, type HydratedDocument } from "mongoose";

import { env } from "@/config/env.config";
import { emitPaymentWebhookEventForStatusChange } from "@/features/developers/developer-webhook-delivery.service";
import { assertMerchantKybApprovedForLive } from "@/features/kyc/kyc.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  queueCustomerReceiptForStatusChange,
  queueMoneyMovementNotificationForStatusChange,
} from "@/features/notifications/notification.service";
import { PaymentModel } from "@/features/payments/payment.model";
import { PayoutModel, type PayoutDocument } from "@/features/payouts/payout.model";
import type {
  CreatePayoutInput,
  ListPayoutsQuery,
  UpdatePayoutInput,
} from "@/features/payouts/payout.validation";
import { getCctpSettlementConfig } from "@/features/settlement/providers/cctp/config";
import { bridgeUsdcToStellar } from "@/features/settlement/providers/cctp/service";
import {
  depositToStellarVault,
  releaseStellarVaultBatch,
} from "@/features/settlement/providers/stellar/vault.service";
import {
  SettlementAccountModel,
  type SettlementAccountRecord,
} from "@/features/settlement/settlement-account.model";
import { normalizeStellarAddress } from "@/shared/constants/stellar";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";
import { createRuntimeModeCondition, toStoredRuntimeMode } from "@/shared/utils/runtime-environment";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";

type PayoutRecord = HydratedDocument<PayoutDocument>;

const kycOnlyDailySettlementLimitUsdc = env.KYC_ONLY_DAILY_SETTLEMENT_LIMIT_USD;

function getUtcDayRange(date = new Date()) {
  const start = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
  const end = new Date(start);

  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end };
}

async function getDailyPayoutVolumeUsdc(input: {
  merchantId: string;
  environment: RuntimeMode;
  date?: Date;
}) {
  const { start, end } = getUtcDayRange(input.date);
  const [result] = await PayoutModel.aggregate<{ total: number }>([
    {
      $match: {
        merchantId: new Types.ObjectId(input.merchantId),
        environment: toStoredRuntimeMode(input.environment),
        status: { $nin: ["failed", "cancelled"] },
        createdAt: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$netUsdc" },
      },
    },
  ]);

  return result?.total ?? 0;
}

function shouldHoldForStarterDailyLimit(input: {
  verificationTier: "none" | "owner" | "business";
  payoutStatus: string;
  dailyVolumeUsdc: number;
  payoutNetUsdc: number;
}) {
  return (
    input.verificationTier === "owner" &&
    ["queued", "confirming"].includes(input.payoutStatus) &&
    input.dailyVolumeUsdc + input.payoutNetUsdc > kycOnlyDailySettlementLimitUsdc
  );
}

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
  bridgeMessage?: string | null;
  bridgeAttestation?: string | null;
  creditTxHash?: string | null;
  vaultBatchId?: string | null;
  vaultDepositTxHash?: string | null;
  vaultReleaseTxHash?: string | null;
  vaultHeldAt?: Date | null;
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
    vaultBatchId: document.vaultBatchId ?? null,
    vaultDepositTxHash: document.vaultDepositTxHash ?? null,
    vaultReleaseTxHash: document.vaultReleaseTxHash ?? null,
    vaultHeldAt: document.vaultHeldAt ?? null,
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
    case "held":
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
  if (nextStatus === "settled") {
    payment.collection.paidAt = payment.collection.paidAt ?? new Date();
  }
  if (nextStatus === "failed" && payment.collection.status !== "paid") {
    payment.collection.status = "failed";
  }
  await payment.save();

  await Promise.all([
    emitPaymentWebhookEventForStatusChange({
      previousStatus,
      paymentId: payment._id.toString(),
      nextStatus: payment.status,
    }).catch(() => undefined),
    queueMoneyMovementNotificationForStatusChange({
      previousStatus,
      paymentId: payment._id.toString(),
      nextStatus: payment.status,
    }).catch(() => undefined),
    queueCustomerReceiptForStatusChange({
      previousStatus,
      paymentId: payment._id.toString(),
      nextStatus: payment.status,
    }).catch(() => undefined),
  ]);
}

async function resolvePayoutSettlementAccount(payout: {
  sourcePaymentId?: { toString(): string } | null;
}) {
  if (!payout.sourcePaymentId) {
    return null;
  }

  const payment = await PaymentModel.findById(payout.sourcePaymentId)
    .select({ settlementAccountId: 1 })
    .exec();

  if (!payment?.settlementAccountId) {
    return null;
  }

  const account = await SettlementAccountModel.findById(payment.settlementAccountId).exec();

  if (!account) {
    throw new HttpError(404, "Settlement account was not found.");
  }

  return account;
}

function toPayoutProcessingResult(payout: PayoutRecord, payoutReady: boolean) {
  return {
    payoutId: payout._id.toString(),
    status: payout.status,
    bridgeSourceTxHash: payout.bridgeSourceTxHash ?? null,
    bridgeReceiveTxHash: payout.bridgeReceiveTxHash ?? null,
    creditTxHash: payout.creditTxHash ?? null,
    vaultBatchId: payout.vaultBatchId ?? null,
    vaultDepositTxHash: payout.vaultDepositTxHash ?? null,
    vaultReleaseTxHash: payout.vaultReleaseTxHash ?? null,
    payoutReady,
  };
}

function getPayoutProcessingDelay(payout: { scheduledFor: Date }) {
  return Math.max(0, payout.scheduledFor.getTime() - Date.now());
}

function shouldSkipPayoutProcessing(payout: {
  status: string;
  creditTxHash?: string | null;
}) {
  return (
    payout.status === "held" ||
    payout.status === "settled" ||
    payout.status === "reversed" ||
    Boolean(payout.creditTxHash)
  );
}

async function enqueuePayoutProcessingJob(input: {
  payoutId: string;
  delayMs?: number;
  phase?: "attestation" | "release" | "now";
}) {
  const delayMs = input.delayMs ?? 0;
  const phase = input.phase ?? (delayMs > 0 ? "release" : "now");
  const jobId =
    phase === "attestation"
      ? `payout-processing-${input.payoutId}-${phase}-${Date.now()}`
      : `payout-processing-${input.payoutId}-${phase}`;

  return enqueueQueueJob(
    queueNames.payoutProcessing,
    "payout-processing",
    { payoutId: input.payoutId },
    {
      jobId,
      attempts: 3,
      ...(delayMs > 0 ? { delayMs } : {}),
    }
  );
}

async function processStellarVaultPayout(input: {
  payout: PayoutRecord;
  account: SettlementAccountRecord;
  runtimeEnvironment: RuntimeMode;
}) {
  const { payout, account, runtimeEnvironment } = input;
  const accountDestinationAddress = normalizeStellarAddress(account.destinationAddress);
  const payoutDestinationAddress = normalizeStellarAddress(payout.destinationWallet);

  if (!accountDestinationAddress) {
    throw new HttpError(409, "Stellar settlement account is not configured.");
  }

  if (payoutDestinationAddress !== accountDestinationAddress) {
    throw new HttpError(
      409,
      "Payout destination must match the Stellar settlement wallet."
    );
  }

  if (!payout.bridgeReceiveTxHash) {
    const bridge = await bridgeUsdcToStellar({
      environment: runtimeEnvironment,
      amount: payout.netUsdc,
      sourceTxHash: payout.bridgeSourceTxHash ?? null,
      receiveTxHash: payout.bridgeReceiveTxHash ?? null,
      message: payout.bridgeMessage ?? null,
      attestation: payout.bridgeAttestation ?? null,
    });

    payout.status = "confirming";
    payout.bridgeSourceTxHash = bridge.sourceTxHash ?? null;
    payout.bridgeReceiveTxHash = bridge.receiveTxHash ?? null;
    payout.bridgeMessage = bridge.message ?? null;
    payout.bridgeAttestation = bridge.attestation ?? null;
    if (bridge.attested) {
      payout.bridgeAttestedAt = payout.bridgeAttestedAt ?? new Date();
    }
    payout.txHash =
      bridge.receiveTxHash ?? bridge.sourceTxHash ?? payout.txHash ?? null;
    payout.creditTxHash = null;
    payout.submittedAt = payout.submittedAt ?? new Date();
    payout.settledAt = null;
    payout.reversalReason = null;
    await payout.save();

    await syncLinkedPaymentFromPayout(payout);

    if (!bridge.completed) {
      await enqueuePayoutProcessingJob({
        payoutId: payout._id.toString(),
        delayMs: getCctpSettlementConfig(runtimeEnvironment).attestationPollIntervalMs,
        phase: "attestation",
      });

      return toPayoutProcessingResult(payout, false);
    }
  }

  if (!payout.vaultDepositTxHash) {
    const deposit = await depositToStellarVault({
      payoutId: payout._id.toString(),
      merchantId: payout.merchantId.toString(),
      environment: runtimeEnvironment,
      accountId: account._id.toString(),
      amount: payout.netUsdc,
      destinationAddress: accountDestinationAddress,
      releaseAt: payout.scheduledFor,
    });

    payout.status = "confirming";
    payout.vaultBatchId = deposit.vaultBatchId;
    payout.vaultDepositTxHash = deposit.txHash;
    if (deposit.releaseAt.getTime() > payout.scheduledFor.getTime()) {
      payout.scheduledFor = deposit.releaseAt;
    }
    payout.vaultHeldAt = new Date();
    payout.txHash = deposit.txHash;
    payout.creditTxHash = null;
    payout.submittedAt = payout.submittedAt ?? new Date();
    payout.settledAt = null;
    payout.reversalReason = null;
    await payout.save();

    await syncLinkedPaymentFromPayout(payout);
  }

  const delayMs = getPayoutProcessingDelay(payout);

  if (delayMs > 0) {
    await enqueuePayoutProcessingJob({
      payoutId: payout._id.toString(),
      delayMs,
    });

    return toPayoutProcessingResult(payout, false);
  }

  if (!payout.vaultBatchId) {
    throw new HttpError(409, "Stellar vault batch is not configured.");
  }

  const release = await releaseStellarVaultBatch({
    environment: runtimeEnvironment,
    vaultBatchId: payout.vaultBatchId,
  });

  payout.status = "settled";
  payout.vaultReleaseTxHash = release.txHash;
  payout.txHash = release.txHash;
  payout.creditTxHash = release.txHash;
  payout.settledAt = new Date();
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
      .select({ settlementAccountId: 1 })
      .exec();

    if (!sourcePayment) {
      throw new HttpError(404, "Source payment was not found.");
    }

    if (sourcePayment.settlementAccountId) {
      const account = await SettlementAccountModel.findById(
        sourcePayment.settlementAccountId
      ).exec();

      if (!account) {
        throw new HttpError(404, "Settlement account was not found.");
      }

      const accountDestinationAddress = normalizeStellarAddress(
        account.destinationAddress
      );
      const payoutDestinationAddress = normalizeStellarAddress(
        input.destinationWallet
      );

      if (
        accountDestinationAddress &&
        payoutDestinationAddress !== accountDestinationAddress
      ) {
        throw new HttpError(
          409,
          "Payout destination must match the Stellar settlement wallet."
        );
      }
    }
  }

  const verificationAccess = await assertMerchantKybApprovedForLive(
    input.merchantId,
    "creating payouts",
    input.environment
  );
  const dailyVolumeUsdc =
    verificationAccess.tier === "owner"
      ? await getDailyPayoutVolumeUsdc({
          merchantId: input.merchantId,
          environment: input.environment,
        })
      : 0;
  const starterLimitExceeded = shouldHoldForStarterDailyLimit({
    verificationTier: verificationAccess.tier,
    payoutStatus: input.status,
    dailyVolumeUsdc,
    payoutNetUsdc: input.netUsdc,
  });
  const status = starterLimitExceeded ? "held" : input.status;
  const vaultHeldAt = starterLimitExceeded
    ? input.vaultHeldAt ?? new Date()
    : input.vaultHeldAt ?? null;
  const reversalReason = starterLimitExceeded
    ? input.reversalReason ?? "Starter daily settlement limit reached."
    : input.reversalReason ?? null;

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
    destinationWallet: normalizeStellarAddress(input.destinationWallet) ?? input.destinationWallet,
    status,
    txHash: input.txHash ?? null,
    bridgeSourceTxHash: input.bridgeSourceTxHash ?? null,
    bridgeReceiveTxHash: input.bridgeReceiveTxHash ?? null,
    creditTxHash: input.creditTxHash ?? null,
    vaultBatchId: input.vaultBatchId ?? null,
    vaultDepositTxHash: input.vaultDepositTxHash ?? null,
    vaultReleaseTxHash: input.vaultReleaseTxHash ?? null,
    vaultHeldAt,
    submittedAt: input.submittedAt ?? null,
    scheduledFor: input.scheduledFor,
    settledAt: input.settledAt ?? null,
    reversedAt: input.reversedAt ?? null,
    reversalReason,
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

  if (input.vaultBatchId !== undefined) {
    payout.vaultBatchId = input.vaultBatchId ?? null;
  }

  if (input.vaultDepositTxHash !== undefined) {
    payout.vaultDepositTxHash = input.vaultDepositTxHash ?? null;
  }

  if (input.vaultReleaseTxHash !== undefined) {
    payout.vaultReleaseTxHash = input.vaultReleaseTxHash ?? null;
  }

  if (input.vaultHeldAt !== undefined) {
    payout.vaultHeldAt = input.vaultHeldAt ?? null;
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

  if (shouldSkipPayoutProcessing(payout)) {
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

  const delayMs = getPayoutProcessingDelay(payout);

  if (delayMs > 0 && payout.vaultDepositTxHash) {
    const queuedJob = await enqueuePayoutProcessingJob({
      payoutId,
      delayMs,
    });

    return {
      queued: Boolean(queuedJob),
      processedInline: false,
      payoutId,
      result: {
        skipped: true,
        status: payout.status,
        scheduledFor: payout.scheduledFor,
        vaultDepositTxHash: payout.vaultDepositTxHash,
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

  const queuedJob = await enqueuePayoutProcessingJob({ payoutId });

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
      vaultBatchId: payout.vaultBatchId ?? null,
      vaultDepositTxHash: payout.vaultDepositTxHash ?? null,
      vaultReleaseTxHash: payout.vaultReleaseTxHash ?? null,
      payoutReady: true,
    };
  }

  if (payout.status === "held") {
    return {
      payoutId: input.payoutId,
      status: payout.status,
      bridgeSourceTxHash: payout.bridgeSourceTxHash ?? null,
      bridgeReceiveTxHash: payout.bridgeReceiveTxHash ?? null,
      creditTxHash: payout.creditTxHash ?? null,
      vaultBatchId: payout.vaultBatchId ?? null,
      vaultDepositTxHash: payout.vaultDepositTxHash ?? null,
      vaultReleaseTxHash: payout.vaultReleaseTxHash ?? null,
      payoutReady: false,
      heldAt: payout.vaultHeldAt ?? payout.updatedAt,
    };
  }

  const delayMs = getPayoutProcessingDelay(payout);

  if (delayMs > 0 && payout.vaultDepositTxHash) {
    await enqueuePayoutProcessingJob({
      payoutId: input.payoutId,
      delayMs,
    });

    return {
      payoutId: input.payoutId,
      status: payout.status,
      bridgeSourceTxHash: payout.bridgeSourceTxHash ?? null,
      bridgeReceiveTxHash: payout.bridgeReceiveTxHash ?? null,
      creditTxHash: payout.creditTxHash ?? null,
      vaultBatchId: payout.vaultBatchId ?? null,
      vaultDepositTxHash: payout.vaultDepositTxHash ?? null,
      vaultReleaseTxHash: payout.vaultReleaseTxHash ?? null,
      payoutReady: false,
      scheduledFor: payout.scheduledFor,
    };
  }

  const merchant = await MerchantModel.findById(payout.merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  const runtimeEnvironment = toStoredRuntimeMode(payout.environment);
  const settlementAccount = await resolvePayoutSettlementAccount(payout);

  if (
    settlementAccount?.provider === "stellar_vault" &&
    settlementAccount.chain === "stellar"
  ) {
    return processStellarVaultPayout({
      payout,
      account: settlementAccount,
      runtimeEnvironment,
    });
  }

  payout.status = "failed";
  payout.bridgeSourceTxHash = null;
  payout.bridgeReceiveTxHash = null;
  payout.bridgeMessage = null;
  payout.bridgeAttestation = null;
  payout.creditTxHash = null;
  payout.bridgeAttestedAt = null;
  payout.submittedAt = payout.submittedAt ?? new Date();
  payout.settledAt = null;
  payout.reversalReason = "Stellar settlement account is not configured for automated payout.";
  await payout.save();

  await syncLinkedPaymentFromPayout(payout);

  console.log(
    `[payout-processing] unsupported-settlement-account ${JSON.stringify({
      payoutId: input.payoutId,
      status: payout.status,
      accountId: settlementAccount?._id.toString() ?? null,
      provider: settlementAccount?.provider ?? null,
      chain: settlementAccount?.chain ?? null,
    })}`
  );

  return toPayoutProcessingResult(payout, false);
}

export const __test__ = {
  getPayoutProcessingDelay,
  resolvePaymentStatusFromPayout,
  shouldHoldForStarterDailyLimit,
  shouldSkipPayoutProcessing,
};
