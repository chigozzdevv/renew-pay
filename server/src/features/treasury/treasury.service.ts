import { randomBytes } from "crypto";

import bs58 from "bs58";
import { Types } from "mongoose";
import nacl from "tweetnacl";

import { getProtocolRuntimeConfig } from "@/config/protocol.config";
import { appendAuditLog } from "@/features/audit/audit.service";
import { ChargeModel } from "@/features/charges/charge.model";
import { CheckoutSessionModel } from "@/features/checkout/checkout-session.model";
import {
  addSquadsGovernanceMember,
  changeSquadsGovernanceThreshold,
  createSquadsGovernanceVault,
  createSquadsOperatorVault,
  loadSquadsGovernanceSnapshot,
  removeSquadsGovernanceMember,
} from "@/features/governance/squads.service";
import { assertMerchantKybApprovedForLive } from "@/features/kyc/kyc.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  queuePayoutBatchNotification,
  queueTreasuryApprovalNeededNotification,
  queueTreasuryOperationStatusNotification,
} from "@/features/notifications/notification.service";
import { PlanModel } from "@/features/plans/plan.model";
import { getOrCreateMerchantSetting } from "@/features/settings/setting.factory";
import { SettingModel } from "@/features/settings/setting.model";
import { SubscriptionModel } from "@/features/subscriptions/subscription.model";
import { TeamMemberModel } from "@/features/teams/team.model";
import {
  cancelProtocolSubscription,
  confirmProtocolPayoutDestinationUpdate,
  createProtocolMerchant,
  createProtocolPlan,
  createProtocolSubscriptionForMerchant,
  deriveProtocolMandateHash,
  encodeMerchantRegisterCall,
  encodePlanCreateCall,
  encodePlanUpdateCall,
  extractPlanIdFromTransaction,
  extractSubscriptionIdFromTransaction,
  requestProtocolPayoutDestinationUpdate,
  updateProtocolPlan,
  pauseProtocolSubscription,
  resumeProtocolSubscription,
  getRenewSubscriptionOperatorAddress,
  isMerchantSubscriptionOperatorAuthorized,
  isProtocolMerchantRegistered,
  updateProtocolSubscriptionMandate,
  withdrawProtocolMerchantBalance,
} from "@/features/protocol/protocol.merchant";
import {
  encodePayoutWalletChangeConfirmCall,
  encodePayoutWalletChangeRequestCall,
  encodeReserveWalletClearCall,
  encodeReserveWalletPromoteCall,
  encodeReserveWalletUpdateCall,
  encodeWithdrawCallBaseUnits,
  fromUsdcBaseUnits,
  toUsdcBaseUnits,
} from "@/features/treasury/treasury.protocol";
import {
  TreasuryAccountModel,
  type TreasuryAccountDocument,
} from "@/features/treasury/treasury-account.model";
import { TreasuryOperationModel } from "@/features/treasury/treasury-operation.model";
import { PayoutBatchModel } from "@/features/treasury/payout-batch.model";
import { TreasurySignerModel } from "@/features/treasury/treasury-signer.model";
import { getSolanaSettlementAuthorityKeypair } from "@/features/solana/solana-keypair.service";
import {
  findConfigPda,
  getRenewProgramRuntime,
} from "@/features/solana/renew-program.service";
import type {
  AddTreasuryOwnerInput,
  BootstrapTreasuryInput,
  CreateTreasurySignerChallengeInput,
  PayoutBatchPreviewInput,
  PayoutSettingsInput,
  RejectTreasuryOperationInput,
  RemoveTreasuryOwnerInput,
  UpdateTreasuryThresholdInput,
  VerifyTreasurySignerInput,
  WithdrawPayoutBatchInput,
} from "@/features/treasury/treasury.validation";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { createRuntimeModeCondition, toStoredRuntimeMode } from "@/shared/utils/runtime-environment";
import { HttpError } from "@/shared/errors/http-error";
import { normalizeSolanaAddress } from "@/shared/constants/solana";

import { SettlementModel } from "@/features/settlements/settlement.model";

const PAYOUT_WALLET_CHANGE_DELAY_MS = 24 * 60 * 60 * 1000;

type SubscriptionChargeJobResult = Awaited<
  ReturnType<typeof import("@/features/charges/charge.service").runSubscriptionChargeJob>
>;

function normalizeAddress(value: string) {
  const normalized = normalizeSolanaAddress(value);

  if (!normalized) {
    throw new HttpError(400, "Wallet address must be a valid Solana address.");
  }

  return normalized;
}

function resolveTeamMemberActor(member: {
  name?: string | null;
  email: string;
}) {
  return member.name?.trim() || member.email.trim();
}

function toNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getOperatorVaultContext(treasuryAccount: TreasuryAccountDocument) {
  const operatorMultisigAddress = treasuryAccount.operatorMultisigAddress?.trim();
  const operatorVaultAddress = treasuryAccount.operatorVaultAddress?.trim();
  const operatorVaultIndex = treasuryAccount.operatorVaultIndex;

  if (
    !operatorMultisigAddress ||
    !operatorVaultAddress ||
    typeof operatorVaultIndex !== "number" ||
    !Number.isInteger(operatorVaultIndex) ||
    operatorVaultIndex < 0
  ) {
    throw new HttpError(
      409,
      "Treasury operator vault is not configured for this merchant yet."
    );
  }

  return {
    operatorMultisigAddress,
    operatorVaultAddress,
    operatorVaultIndex,
  };
}

function getProtocolProgramAddress(environment: RuntimeMode) {
  return normalizeAddress(getProtocolRuntimeConfig(environment).programId);
}

function buildGovernanceApprovalMessage(input: {
  merchantId: string;
  operationId: string;
  operationKind: string;
  governanceMultisigAddress: string;
  governanceVaultAddress: string;
}) {
  return [
    "Renew governance approval",
    `Merchant: ${input.merchantId}`,
    `Operation: ${input.operationId}`,
    `Kind: ${input.operationKind}`,
    `Multisig: ${input.governanceMultisigAddress}`,
    `Vault: ${input.governanceVaultAddress}`,
  ].join("\n");
}

function verifyDetachedSolanaMessage(input: {
  message: string;
  signature: string;
  walletAddress: string;
}) {
  try {
    return nacl.sign.detached.verify(
      Buffer.from(input.message, "utf8"),
      bs58.decode(input.signature),
      bs58.decode(input.walletAddress)
    );
  } catch {
    return false;
  }
}

async function syncCheckoutSessionWithChargeResult(input: {
  checkoutSessionId: string;
  billingCurrency: string;
  chargeResult: SubscriptionChargeJobResult;
}) {
  const session = await CheckoutSessionModel.findById(input.checkoutSessionId).exec();

  if (!session) {
    return;
  }

  session.status =
    "skipped" in input.chargeResult && input.chargeResult.skipped
      ? "scheduled"
      : "chargeId" in input.chargeResult && input.chargeResult.chargeId
        ? "pending_payment"
        : "scheduled";

  if ("chargeId" in input.chargeResult && input.chargeResult.chargeId) {
    const createdCharge = await ChargeModel.findById(input.chargeResult.chargeId)
      .select({ usdcAmount: 1, feeAmount: 1, status: 1, localAmount: 1 })
      .lean()
      .exec();

    session.chargeId = new Types.ObjectId(input.chargeResult.chargeId);
    session.settlementId =
      "settlementId" in input.chargeResult && input.chargeResult.settlementId
        ? new Types.ObjectId(input.chargeResult.settlementId)
        : null;
    session.paymentSnapshot = {
      provider:
        "collection" in input.chargeResult
          ? toNullableString(
            (input.chargeResult.collection as Record<string, unknown>).provider
          )
          : null,
      kind:
        "collection" in input.chargeResult
          ? toNullableString(
            (input.chargeResult.collection as Record<string, unknown>).kind
          )
          : null,
      externalChargeId:
        "externalChargeId" in input.chargeResult
          ? input.chargeResult.externalChargeId ?? null
          : null,
      billingCurrency: input.billingCurrency,
      localAmount: createdCharge?.localAmount ?? null,
      usdcAmount: createdCharge?.usdcAmount ?? null,
      feeAmount: createdCharge?.feeAmount ?? null,
      status:
        createdCharge?.status ??
        ("collectionStatus" in input.chargeResult
          ? input.chargeResult.collectionStatus ?? "pending"
          : "pending"),
      reference:
        "collection" in input.chargeResult
          ? toNullableString(
            (input.chargeResult.collection as Record<string, unknown>).reference
          )
          : null,
      expiresAt:
        "collection" in input.chargeResult &&
          (input.chargeResult.collection as Record<string, unknown>).expiresAt
          ? new Date(
            (input.chargeResult.collection as Record<string, unknown>).expiresAt as string
          )
          : null,
      redirectUrl:
        "collection" in input.chargeResult
          ? toNullableString(
            (input.chargeResult.collection as Record<string, unknown>).redirectUrl
          )
          : null,
      bankTransfer:
        "collection" in input.chargeResult &&
          typeof (input.chargeResult.collection as Record<string, unknown>).bankTransfer ===
          "object" &&
          (input.chargeResult.collection as Record<string, unknown>).bankTransfer !== null
          ? {
            bankCode: toNullableString(
              ((input.chargeResult.collection as Record<string, unknown>).bankTransfer as Record<
                string,
                unknown
              >).bankCode
            ),
            bankName: toNullableString(
              ((input.chargeResult.collection as Record<string, unknown>).bankTransfer as Record<
                string,
                unknown
              >).bankName
            ),
            accountNumber: toNullableString(
              ((input.chargeResult.collection as Record<string, unknown>).bankTransfer as Record<
                string,
                unknown
              >).accountNumber
            ),
            accountName: toNullableString(
              ((input.chargeResult.collection as Record<string, unknown>).bankTransfer as Record<
                string,
                unknown
              >).accountName
            ),
            currency: toNullableString(
              ((input.chargeResult.collection as Record<string, unknown>).bankTransfer as Record<
                string,
                unknown
              >).currency
            ),
          }
          : null,
    };
    session.failureReason = null;
  }

  await session.save();
}

function mapRetryPolicyToMaxRetryCount(input: {
  autoRetries?: boolean | null;
  retryPolicy?: string | null;
}) {
  if (!input.autoRetries) {
    return 0;
  }

  switch ((input.retryPolicy ?? "").trim()) {
    case "No automatic retries":
      return 0;
    case "2 retries over 3 days":
      return 2;
    default:
      return 3;
  }
}

async function getMerchantMaxRetryCount(merchantId: string) {
  const setting = await SettingModel.findOne({ merchantId })
    .select({ "billing.autoRetries": 1, "billing.retryPolicy": 1 })
    .lean()
    .exec();

  return mapRetryPolicyToMaxRetryCount({
    autoRetries: setting?.billing?.autoRetries,
    retryPolicy: setting?.billing?.retryPolicy,
  });
}

async function getProtocolFeeBps(environment: RuntimeMode) {
  const settlementAuthority = getSolanaSettlementAuthorityKeypair(environment);
  const runtime = getRenewProgramRuntime(environment, settlementAuthority);
  const accounts = runtime.program.account as unknown as Record<
    string,
    {
      fetch(address: unknown): Promise<unknown>;
    }
  >;
  const config = (await accounts.config.fetch(
    findConfigPda(runtime.programId)
  )) as {
    protocolFeeBps: number;
  };

  return config.protocolFeeBps;
}

function toTreasurySignerResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  teamMemberId: { toString(): string };
  walletAddress: string;
  status: string;
  challengeMessage?: string | null;
  challengeIssuedAt?: Date | null;
  verifiedAt?: Date | null;
  revokedAt?: Date | null;
  lastApprovedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    teamMemberId: document.teamMemberId.toString(),
    walletAddress: document.walletAddress,
    status: document.status,
    challengeMessage: document.challengeMessage ?? null,
    challengeIssuedAt: document.challengeIssuedAt ?? null,
    verifiedAt: document.verifiedAt ?? null,
    revokedAt: document.revokedAt ?? null,
    lastApprovedAt: document.lastApprovedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toTreasuryOperationResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  treasuryAccountId: { toString(): string };
  settlementId?: { toString(): string } | null;
  kind: string;
  status: string;
  governanceMultisigAddress: string;
  governanceVaultAddress: string;
  threshold: number;
  targetAddress: string;
  value: string;
  data: string;
  origin: string;
  createdBy: string;
  signatures: Array<{
    teamMemberId: string;
    name: string;
    email: string;
    role: string;
    walletAddress: string;
    signedAt: Date;
  }>;
  txHash?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  rejectedAt?: Date | null;
  executedAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    treasuryAccountId: document.treasuryAccountId.toString(),
    settlementId: document.settlementId?.toString() ?? null,
    kind: document.kind,
    status: document.status,
    governanceMultisigAddress: document.governanceMultisigAddress,
    governanceVaultAddress: document.governanceVaultAddress,
    threshold: document.threshold,
    approvedCount: document.signatures.length,
    canExecute:
      document.status === "approved" &&
      document.signatures.length >= document.threshold,
    targetAddress: document.targetAddress,
    value: document.value,
    data: document.data,
    origin: document.origin,
    createdBy: document.createdBy,
    signatures: document.signatures.map((entry) => ({
      teamMemberId: entry.teamMemberId,
      name: entry.name,
      email: entry.email,
      role: entry.role,
      walletAddress: entry.walletAddress,
      signedAt: entry.signedAt,
    })),
    txHash: document.txHash ?? null,
    rejectedBy: document.rejectedBy ?? null,
    rejectionReason: document.rejectionReason ?? null,
    rejectedAt: document.rejectedAt ?? null,
    executedAt: document.executedAt ?? null,
    metadata: document.metadata ?? {},
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toPayoutBatchResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  environment: string;
  destinationWallet: string;
  status: string;
  trigger: string;
  settlementIds: Array<{ toString(): string }>;
  grossUsdc: number;
  feeUsdc: number;
  netUsdc: number;
  txHash?: string | null;
  openedAt: Date;
  executedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    environment: document.environment,
    destinationWallet: document.destinationWallet,
    status: document.status,
    trigger: document.trigger,
    settlementIds: document.settlementIds.map((entry) => entry.toString()),
    settlementCount: document.settlementIds.length,
    grossUsdc: document.grossUsdc,
    feeUsdc: document.feeUsdc,
    netUsdc: document.netUsdc,
    txHash: document.txHash ?? null,
    openedAt: document.openedAt,
    executedAt: document.executedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

const getOrCreatePayoutSetting = getOrCreateMerchantSetting;

async function listEligiblePayoutSettlements(merchantId: string, environment: RuntimeMode) {
  return SettlementModel.find({
    merchantId,
    payoutBatchId: null,
    creditTxHash: { $type: "string" },
    status: "confirming",
    ...createRuntimeModeCondition("environment", environment),
  })
    .sort({ createdAt: 1 })
    .exec();
}

function buildPayoutBatchTotals(
  settlements: Array<{
    protocolAmountUsdc?: number | null;
    netUsdc: number;
  }>,
  protocolFeeBps: bigint
) {
  const grossBaseUnits = settlements.reduce((total, settlement) => {
    const protocolAmountUsdc =
      typeof settlement.protocolAmountUsdc === "number" &&
      Number.isFinite(settlement.protocolAmountUsdc) &&
      settlement.protocolAmountUsdc > 0
        ? settlement.protocolAmountUsdc
        : settlement.netUsdc;

    return total + toUsdcBaseUnits(protocolAmountUsdc);
  }, 0n);
  const protocolFeeBaseUnits = (grossBaseUnits * protocolFeeBps) / 10_000n;
  const withdrawBaseUnits = grossBaseUnits - protocolFeeBaseUnits;

  if (withdrawBaseUnits <= 0n) {
    throw new HttpError(
      409,
      "Settlement batch net amount is too low after protocol fees to withdraw."
    );
  }

  return {
    grossUsdc: fromUsdcBaseUnits(grossBaseUnits),
    feeUsdc: fromUsdcBaseUnits(protocolFeeBaseUnits),
    netUsdc: fromUsdcBaseUnits(withdrawBaseUnits),
    withdrawBaseUnits,
  };
}

async function syncPayoutBatchSettlements(input: {
  batchId: string;
  txHash?: string | null;
}) {
  const batch = await PayoutBatchModel.findById(input.batchId).exec();

  if (!batch) {
    throw new HttpError(404, "Payout batch was not found.");
  }

  batch.status = "executed";
  batch.executedAt = batch.executedAt ?? new Date();

  if (input.txHash !== undefined) {
    batch.txHash = input.txHash ?? null;
  }

  await batch.save();

  for (const settlementId of batch.settlementIds) {
    await syncSettlementChargeState({
      settlementId: settlementId.toString(),
      status: "settled",
      txHash: input.txHash ?? null,
    });
  }

  return batch;
}

function toTreasuryAccountResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  custodyModel: string;
  governanceMultisigAddress: string;
  governanceVaultAddress: string;
  operatorMultisigAddress?: string | null;
  operatorVaultAddress?: string | null;
  payoutWallet: string;
  reserveWallet?: string | null;
  ownerAddresses: string[];
  threshold: number;
  governanceVaultIndex: number;
  operatorVaultIndex?: number | null;
  network: string;
  gasPolicy: string;
  status: string;
  pendingPayoutWallet?: string | null;
  payoutWalletChangeReadyAt?: Date | null;
  lastSyncedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    custodyModel: document.custodyModel,
    governanceMultisigAddress: document.governanceMultisigAddress,
    governanceVaultAddress: document.governanceVaultAddress,
    operatorMultisigAddress: document.operatorMultisigAddress ?? null,
    operatorVaultAddress: document.operatorVaultAddress ?? null,
    payoutWallet: document.payoutWallet,
    reserveWallet: document.reserveWallet ?? null,
    ownerAddresses: document.ownerAddresses,
    threshold: document.threshold,
    governanceVaultIndex: document.governanceVaultIndex,
    operatorVaultIndex: document.operatorVaultIndex ?? null,
    network: document.network,
    gasPolicy: document.gasPolicy,
    status: document.status,
    pendingPayoutWallet: document.pendingPayoutWallet ?? null,
    payoutWalletChangeReadyAt: document.payoutWalletChangeReadyAt ?? null,
    lastSyncedAt: document.lastSyncedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function getMerchantOrThrow(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

async function getTeamMemberOrThrow(merchantId: string, teamMemberId: string) {
  const member = await TeamMemberModel.findOne({
    _id: teamMemberId,
    merchantId,
  }).exec();

  if (!member) {
    throw new HttpError(404, "Team member was not found.");
  }

  return member;
}

async function ensureOwnerTeamMember(input: {
  merchantId: string;
  teamMemberId: string;
  allowSuspended?: boolean;
}) {
  const member = await getTeamMemberOrThrow(input.merchantId, input.teamMemberId);

  if (!input.allowSuspended && member.status !== "active") {
    throw new HttpError(403, "Owner account is not active.");
  }

  if (member.role !== "owner") {
    throw new HttpError(403, "This action is restricted to workspace owners.");
  }

  return member;
}

async function countActiveOwnerMembers(merchantId: string) {
  return TeamMemberModel.countDocuments({
    merchantId,
    role: "owner",
    status: "active",
  }).exec();
}

function assertMultiOwnerThreshold(input: {
  ownerCount: number;
  threshold: number;
  message?: string;
}) {
  if (input.ownerCount > 1 && input.threshold < 2) {
    throw new HttpError(
      409,
      input.message ??
        "Multi-owner treasury governance must require at least two approvals."
    );
  }
}

async function ensureApprovalWorkflowTreasuryAccount(
  merchantId: string,
  environment: RuntimeMode
) {
  const [activeOwnerCount, treasuryAccount] = await Promise.all([
    countActiveOwnerMembers(merchantId),
    ensureTreasuryAccount(merchantId, environment),
  ]);

  if (activeOwnerCount > 1) {
    if (treasuryAccount.ownerAddresses.length < 2) {
      throw new HttpError(
        409,
        "Multi-owner workspaces must bind at least two owner signer wallets to treasury approvals."
      );
    }

    assertMultiOwnerThreshold({
      ownerCount: treasuryAccount.ownerAddresses.length,
      threshold: treasuryAccount.threshold,
      message:
        "Multi-owner workspaces must require at least two treasury approvals.",
    });
  }

  return {
    activeOwnerCount,
    treasuryAccount,
  };
}

function listRuntimeModes(values: string[]) {
  return [...new Set(values.map((value) => (value === "live" ? "live" : "test")))] as RuntimeMode[];
}

export async function assertTeamMemberCanLeaveOwnerRole(input: {
  merchantId: string;
  teamMemberId: string;
}) {
  const signerBinding = await findTreasurySignerBinding(input);
  const signerWallet =
    signerBinding && signerBinding.status === "active"
      ? normalizeAddress(signerBinding.walletAddress)
      : null;

  const [boundTreasuries, pendingOwnerAddOperations] = await Promise.all([
    signerWallet
      ? TreasuryAccountModel.find({
          merchantId: input.merchantId,
          ownerAddresses: signerWallet,
        })
          .select({ environment: 1 })
          .lean()
          .exec()
      : Promise.resolve([]),
    TreasuryOperationModel.find({
      merchantId: input.merchantId,
      kind: "governance_owner_add",
      status: { $in: ["pending_signatures", "approved"] },
      "metadata.teamMemberId": input.teamMemberId,
    })
      .select({ environment: 1 })
      .lean()
      .exec(),
  ]);

  const environments = listRuntimeModes([
    ...boundTreasuries.map((entry) => String(entry.environment ?? "test")),
    ...pendingOwnerAddOperations.map((entry) => String(entry.environment ?? "test")),
  ]);

  if (environments.length > 0) {
    throw new HttpError(
      409,
      `Remove this owner from treasury governance in ${environments.join(
        ", "
      )} before changing their workspace owner status.`
    );
  }
}

export async function syncOwnerTreasuryGovernance(input: {
  merchantId: string;
  teamMemberId: string;
  requesterTeamMemberId: string;
  actor: string;
  requireVerifiedSigner?: boolean;
  environments?: RuntimeMode[];
}) {
  const member = await getTeamMemberOrThrow(input.merchantId, input.teamMemberId);

  if (member.role !== "owner" || member.status !== "active") {
    return {
      signerWallet: null,
      pendingSignerVerification: false,
      operations: [],
    };
  }

  const signerBinding = await findTreasurySignerBinding({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
  });

  if (!signerBinding || signerBinding.status !== "active") {
    if (input.requireVerifiedSigner) {
      throw new HttpError(
        409,
        "This owner must verify their Privy Solana wallet as a treasury signer before owner access can be finalized."
      );
    }

    return {
      signerWallet: null,
      pendingSignerVerification: true,
      operations: [],
    };
  }

  const signerWallet = normalizeAddress(signerBinding.walletAddress);
  const [treasuryAccounts, pendingOwnerAddOperations] = await Promise.all([
    TreasuryAccountModel.find({
      merchantId: input.merchantId,
      ...(input.environments && input.environments.length > 0
        ? { environment: { $in: input.environments } }
        : {}),
    }).exec(),
    TreasuryOperationModel.find({
      merchantId: input.merchantId,
      kind: "governance_owner_add",
      status: { $in: ["pending_signatures", "approved"] },
      "metadata.teamMemberId": input.teamMemberId,
      ...(input.environments && input.environments.length > 0
        ? { environment: { $in: input.environments } }
        : {}),
    })
      .select({ environment: 1 })
      .lean()
      .exec(),
  ]);
  const pendingEnvironments = new Set(
    pendingOwnerAddOperations.map((entry) =>
      entry.environment === "live" ? "live" : "test"
    )
  );
  const operations = [];

  for (const treasuryAccount of treasuryAccounts) {
    const governanceOwners = new Set(
      treasuryAccount.ownerAddresses.map(normalizeAddress)
    );
    const environment = toStoredRuntimeMode(treasuryAccount.environment);

    if (governanceOwners.has(signerWallet) || pendingEnvironments.has(environment)) {
      continue;
    }

    const operation = await addTreasuryOwner({
      merchantId: input.merchantId,
      actor: input.actor,
      requesterTeamMemberId: input.requesterTeamMemberId,
      payload: {
        environment,
        teamMemberId: input.teamMemberId,
      },
    });

    operations.push(operation);
  }

  return {
    signerWallet,
    pendingSignerVerification: false,
    operations,
  };
}

async function syncWalletState(input: {
  merchantId: string;
  payoutWallet: string;
  reserveWallet: string | null;
}) {
  const [merchant, setting] = await Promise.all([
    MerchantModel.findById(input.merchantId).exec(),
    SettingModel.findOne({ merchantId: input.merchantId }).exec(),
  ]);

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  merchant.payoutWallet = input.payoutWallet;
  merchant.reserveWallet = input.reserveWallet;

  if (setting) {
    setting.wallets.primaryWallet = input.payoutWallet;
    setting.wallets.reserveWallet = input.reserveWallet;
    await setting.save();
  }

  await merchant.save();
}

async function syncSettlementChargeState(input: {
  settlementId: string;
  status: "confirming" | "settled" | "reversed";
  txHash?: string | null;
}) {
  const settlement = await SettlementModel.findById(input.settlementId).exec();

  if (!settlement) {
    throw new HttpError(404, "Settlement was not found.");
  }

  settlement.status = input.status;

  if (input.txHash !== undefined) {
    settlement.txHash = input.txHash ?? null;
  }

  if (input.status === "confirming" && !settlement.submittedAt) {
    settlement.submittedAt = new Date();
  }

  if (input.status === "settled" && !settlement.settledAt) {
    settlement.settledAt = new Date();
  }

  if (input.status === "reversed" && !settlement.reversedAt) {
    settlement.reversedAt = new Date();
  }

  await settlement.save();

  if (settlement.sourceChargeId) {
    const nextChargeStatus =
      input.status === "confirming"
        ? "confirming"
        : input.status === "settled"
          ? "settled"
          : "reversed";

    await ChargeModel.findByIdAndUpdate(settlement.sourceChargeId, {
      status: nextChargeStatus,
      failureCode:
        nextChargeStatus === "reversed" ? "settlement_reversed" : null,
      processedAt: new Date(),
    }).exec();
  }
}

async function createTreasuryAccountFromGovernanceVault(input: {
  merchantId: string;
  environment: RuntimeMode;
  governanceMultisigAddress: string;
  governanceVaultAddress: string;
  governanceVaultIndex: number;
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
  owners: string[];
  threshold: number;
  payoutWallet: string;
  reserveWallet: string | null;
}) {
  return TreasuryAccountModel.create({
    merchantId: new Types.ObjectId(input.merchantId),
    environment: input.environment,
    custodyModel: "squads",
    governanceMultisigAddress: normalizeAddress(input.governanceMultisigAddress),
    governanceVaultAddress: normalizeAddress(input.governanceVaultAddress),
    operatorMultisigAddress: normalizeAddress(input.operatorMultisigAddress),
    operatorVaultAddress: normalizeAddress(input.operatorVaultAddress),
    payoutWallet: normalizeAddress(input.payoutWallet),
    reserveWallet: input.reserveWallet
      ? normalizeAddress(input.reserveWallet)
      : null,
    ownerAddresses: input.owners.map(normalizeAddress),
    threshold: input.threshold,
    governanceVaultIndex: input.governanceVaultIndex,
    operatorVaultIndex: input.operatorVaultIndex,
    network: "solana",
    gasPolicy: "sponsored",
    status: "active",
    pendingPayoutWallet: null,
    payoutWalletChangeReadyAt: null,
    lastSyncedAt: new Date(),
  });
}

async function ensureTreasuryAccount(
  merchantId: string,
  environment: RuntimeMode
) {
  const existing = await TreasuryAccountModel.findOne({
    merchantId,
    ...createRuntimeModeCondition("environment", environment),
  }).exec();

  if (existing) {
    return existing;
  }

  throw new HttpError(
    409,
    "Treasury governance vault is not configured for this merchant yet."
  );
}

async function ensureProtocolOperatorVault(
  merchantId: string,
  environment: RuntimeMode
) {
  const treasuryAccount = await ensureTreasuryAccount(merchantId, environment);

  if (
    treasuryAccount.operatorMultisigAddress?.trim() &&
    treasuryAccount.operatorVaultAddress?.trim()
  ) {
    return treasuryAccount;
  }

  const operator = await createSquadsOperatorVault({ environment });

  treasuryAccount.operatorMultisigAddress = normalizeAddress(
    operator.operatorMultisigAddress
  );
  treasuryAccount.operatorVaultAddress = normalizeAddress(operator.operatorVaultAddress);
  treasuryAccount.operatorVaultIndex = operator.operatorVaultIndex;
  treasuryAccount.lastSyncedAt = new Date();
  await treasuryAccount.save();

  return treasuryAccount;
}

async function syncTreasuryAccountOwners(
  merchantId: string,
  environment: RuntimeMode
) {
  const treasuryAccount = await TreasuryAccountModel.findOne({
    merchantId,
    ...createRuntimeModeCondition("environment", environment),
  }).exec();

  if (!treasuryAccount) {
    return null;
  }

  const governance = await loadSquadsGovernanceSnapshot({
    environment,
    governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
  });

  treasuryAccount.governanceVaultAddress = normalizeAddress(
    governance.governanceVaultAddress
  );
  treasuryAccount.ownerAddresses = governance.ownerAddresses.map(normalizeAddress);
  treasuryAccount.threshold = governance.threshold;
  treasuryAccount.governanceVaultIndex = governance.governanceVaultIndex;
  treasuryAccount.lastSyncedAt = new Date();
  await treasuryAccount.save();

  return treasuryAccount;
}

function buildSignerChallengeMessage(input: {
  merchantId: string;
  teamMemberId: string;
  walletAddress: string;
  nonce: string;
}) {
  return [
    "Renew treasury signer verification",
    `Merchant: ${input.merchantId}`,
    `Team member: ${input.teamMemberId}`,
    `Wallet: ${input.walletAddress}`,
    `Nonce: ${input.nonce}`,
  ].join("\n");
}

function requireTreasuryOperationStatus(status: string) {
  if (status === "executed") {
    throw new HttpError(409, "Treasury operation has already been executed.");
  }

  if (status === "rejected") {
    throw new HttpError(409, "Treasury operation has been rejected.");
  }
}

async function ensureTreasuryApprover(input: {
  merchantId: string;
  teamMemberId: string;
}) {
  const [member, signerBinding] = await Promise.all([
    ensureOwnerTeamMember({
      merchantId: input.merchantId,
      teamMemberId: input.teamMemberId,
    }),
    TreasurySignerModel.findOne({
      merchantId: input.merchantId,
      teamMemberId: input.teamMemberId,
      status: "active",
    }).exec(),
  ]);

  if (!signerBinding) {
    throw new HttpError(
      409,
      "Treasury signer is not verified for this team member."
    );
  }

  return {
    member,
    signerBinding,
  };
}

async function ensureTreasurySignerMatchesGovernance(input: {
  merchantId: string;
  teamMemberId: string;
  treasuryAccount: Awaited<ReturnType<typeof ensureTreasuryAccount>>;
}) {
  const { member, signerBinding } = await ensureTreasuryApprover({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
  });

  const signerWallet = normalizeAddress(signerBinding.walletAddress);
  const governanceOwners = new Set(
    input.treasuryAccount.ownerAddresses.map(normalizeAddress)
  );

  if (governanceOwners.size > 0 && !governanceOwners.has(signerWallet)) {
    throw new HttpError(
      403,
      "Bound signer wallet is not an owner of the configured governance vault."
    );
  }

  return {
    member,
    signerBinding,
  };
}

async function loadOperationWithTreasury(operationId: string, merchantId?: string) {
  const operation = await TreasuryOperationModel.findById(operationId).exec();

  if (!operation) {
    throw new HttpError(404, "Treasury operation was not found.");
  }

  if (merchantId && operation.merchantId.toString() !== merchantId) {
    throw new HttpError(403, "Treasury operation does not belong to this merchant.");
  }

  const treasuryAccount = await TreasuryAccountModel.findById(
    operation.treasuryAccountId
  ).exec();

  if (!treasuryAccount) {
    throw new HttpError(404, "Treasury account was not found.");
  }

  return {
    operation,
    treasuryAccount,
  };
}

async function findTreasurySignerBinding(input: {
  merchantId: string;
  teamMemberId: string;
}) {
  return TreasurySignerModel.findOne({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
  }).exec();
}

async function syncLinkedProtocolRecordState(input: {
  operation: Awaited<ReturnType<typeof loadOperationWithTreasury>>["operation"];
  status: string;
  txHash?: string | null;
}) {
  const metadata = (input.operation.metadata ?? {}) as Record<string, unknown>;
  const entityType = String(metadata.entityType ?? "").trim();

  if (entityType === "plan") {
    const planId = String(metadata.planId ?? "").trim();

    if (!planId) {
      return;
    }

    const plan = await PlanModel.findById(planId).exec();

    if (!plan) {
      return;
    }

    plan.protocolOperationId = input.operation._id;
    plan.protocolSyncStatus = input.status;
    if (input.txHash !== undefined) {
      plan.protocolTxHash = input.txHash ?? null;
    }
    await plan.save();
    return;
  }

  if (entityType === "subscription") {
    const subscriptionId = String(metadata.subscriptionId ?? "").trim();

    if (!subscriptionId) {
      return;
    }

    const subscription = await SubscriptionModel.findById(subscriptionId).exec();

    if (!subscription) {
      return;
    }

    subscription.protocolOperationId = input.operation._id;
    subscription.protocolSyncStatus = input.status;
    if (input.txHash !== undefined) {
      subscription.protocolTxHash = input.txHash ?? null;
    }
    await subscription.save();
  }
}

async function applyExecutedOperationEffects(input: {
  operation: Awaited<ReturnType<typeof loadOperationWithTreasury>>["operation"];
  treasuryAccount: Awaited<ReturnType<typeof loadOperationWithTreasury>>["treasuryAccount"];
}) {
  const metadata = (input.operation.metadata ?? {}) as Record<string, unknown>;
  const merchantId = input.operation.merchantId.toString();

  if (input.operation.kind === "settlement_sweep" && input.operation.settlementId) {
    await syncSettlementChargeState({
      settlementId: input.operation.settlementId.toString(),
      status: "settled",
      txHash: input.operation.txHash ?? null,
    });
    return;
  }

  if (input.operation.kind === "payout_batch_withdraw") {
    const batchId =
      typeof metadata.batchId === "string" && metadata.batchId.trim()
        ? metadata.batchId.trim()
        : null;

    if (batchId) {
      await syncPayoutBatchSettlements({
        batchId,
        txHash: input.operation.txHash ?? null,
      });
    }
    return;
  }

  if (input.operation.kind === "merchant_register") {
    const pendingPlans = await PlanModel.find({
      merchantId,
      ...createRuntimeModeCondition(
        "environment",
        toStoredRuntimeMode(input.treasuryAccount.environment)
      ),
      protocolPlanId: null,
      $or: [{ status: "active" }, { pendingStatus: "active" }],
    })
      .select({ _id: 1 })
      .lean()
      .exec();

    for (const plan of pendingPlans) {
      await queuePlanProtocolSync({
        merchantId,
        actor: "system",
        environment: toStoredRuntimeMode(input.treasuryAccount.environment),
        planId: plan._id.toString(),
      }).catch(() => null);
    }
    return;
  }

  if (input.operation.kind === "subscription_operator_authorize") {
    return;
  }

  if (input.operation.kind === "plan_create") {
    const metadata = (input.operation.metadata ?? {}) as Record<string, unknown>;
    const localPlanId = String(metadata.planId ?? "").trim();

    if (localPlanId) {
      const plan = await PlanModel.findById(localPlanId).exec();

      if (plan) {
        plan.protocolPlanId = await extractPlanIdFromTransaction(
          toStoredRuntimeMode(input.treasuryAccount.environment),
          merchantId,
          plan.planCode
        );
        plan.protocolOperationId = input.operation._id;
        plan.status = String(metadata.targetStatus ?? plan.pendingStatus ?? "active").trim() || "active";
        plan.pendingStatus = null;
        plan.protocolSyncStatus = "synced";
        plan.protocolTxHash = input.operation.txHash ?? null;
        await plan.save();

        const subscriptions = await SubscriptionModel.find({
          merchantId,
          planId: plan._id,
          ...createRuntimeModeCondition(
            "environment",
            toStoredRuntimeMode(input.treasuryAccount.environment)
          ),
          status: "pending_activation",
          protocolSubscriptionId: null,
        })
          .select({ _id: 1 })
          .lean()
          .exec();

        for (const subscription of subscriptions) {
          await queueSubscriptionProtocolCreate({
            merchantId,
            actor: "system",
            environment: toStoredRuntimeMode(input.treasuryAccount.environment),
            subscriptionId: subscription._id.toString(),
          }).catch(() => null);
        }
      }
    }
    return;
  }

  if (input.operation.kind === "plan_update") {
    const localPlanId = String(metadata.planId ?? "").trim();

    if (localPlanId) {
      const plan = await PlanModel.findById(localPlanId).exec();

      if (plan) {
        plan.protocolOperationId = input.operation._id;
        plan.protocolSyncStatus = "synced";
        plan.protocolTxHash = input.operation.txHash ?? null;
        const targetStatus = String(metadata.targetStatus ?? plan.pendingStatus ?? plan.status).trim();
        if (targetStatus === "active" || targetStatus === "archived" || targetStatus === "draft") {
          plan.status = targetStatus;
        }
        plan.pendingStatus = null;
        await plan.save();
      }
    }
    return;
  }

  if (input.operation.kind === "subscription_create") {
    const metadata = (input.operation.metadata ?? {}) as Record<string, unknown>;
    const localSubscriptionId = String(metadata.subscriptionId ?? "").trim();

    if (localSubscriptionId) {
      const subscription = await SubscriptionModel.findById(localSubscriptionId).exec();

      if (subscription) {
        subscription.protocolSubscriptionId = await extractSubscriptionIdFromTransaction(
          toStoredRuntimeMode(input.treasuryAccount.environment),
          merchantId,
          subscription._id.toString()
        );
        subscription.protocolOperationId = input.operation._id;
        subscription.status = "active";
        subscription.pendingStatus = null;
        subscription.protocolSyncStatus = "synced";
        subscription.protocolTxHash = input.operation.txHash ?? null;
        await subscription.save();

        if (metadata.triggerInitialCharge === true) {
          const { runSubscriptionChargeJob } = await import(
            "@/features/charges/charge.service"
          );
          const chargeResult = await runSubscriptionChargeJob({
            subscriptionId: subscription._id.toString(),
          });
          const checkoutSessionId = String(metadata.checkoutSessionId ?? "").trim();

          if (checkoutSessionId) {
            await syncCheckoutSessionWithChargeResult({
              checkoutSessionId,
              billingCurrency: subscription.billingCurrency,
              chargeResult,
            });
          }
        }
      }
    }
    return;
  }

  if (
    input.operation.kind === "subscription_pause" ||
    input.operation.kind === "subscription_resume" ||
    input.operation.kind === "subscription_cancel" ||
    input.operation.kind === "subscription_mandate_update"
  ) {
    const localSubscriptionId = String(metadata.subscriptionId ?? "").trim();

    if (localSubscriptionId) {
      const subscription = await SubscriptionModel.findById(localSubscriptionId).exec();

      if (subscription) {
        subscription.protocolOperationId = input.operation._id;
        subscription.protocolSyncStatus = "synced";
        subscription.protocolTxHash = input.operation.txHash ?? null;

        if (input.operation.kind === "subscription_pause") {
          subscription.status = "paused";
          subscription.pendingStatus = null;
        } else if (input.operation.kind === "subscription_resume") {
          subscription.status = "active";
          subscription.pendingStatus = null;
        } else if (input.operation.kind === "subscription_cancel") {
          subscription.status = "cancelled";
          subscription.pendingStatus = null;
        } else if (input.operation.kind === "subscription_mandate_update") {
          subscription.pendingStatus = null;
        }

        await subscription.save();
      }
    }
    return;
  }

  if (input.operation.kind === "payout_wallet_change_request") {
    const nextWallet = String(metadata.nextWallet ?? "").trim().toLowerCase();

    if (!nextWallet) {
      throw new HttpError(500, "Treasury operation is missing the next payout wallet.");
    }

    input.treasuryAccount.pendingPayoutWallet = nextWallet;
    input.treasuryAccount.payoutWalletChangeReadyAt = new Date(
      Date.now() + PAYOUT_WALLET_CHANGE_DELAY_MS
    );
    await input.treasuryAccount.save();
    return;
  }

  if (input.operation.kind === "payout_wallet_change_confirm") {
    if (
      !input.treasuryAccount.pendingPayoutWallet ||
      !input.treasuryAccount.payoutWalletChangeReadyAt
    ) {
      throw new HttpError(409, "No payout wallet change is pending.");
    }

    input.treasuryAccount.payoutWallet =
      input.treasuryAccount.pendingPayoutWallet;
    input.treasuryAccount.pendingPayoutWallet = null;
    input.treasuryAccount.payoutWalletChangeReadyAt = null;
    await input.treasuryAccount.save();
    await syncWalletState({
      merchantId,
      payoutWallet: input.treasuryAccount.payoutWallet,
      reserveWallet: input.treasuryAccount.reserveWallet ?? null,
    });
    return;
  }

  if (input.operation.kind === "reserve_wallet_update") {
    const reserveWallet = String(metadata.reserveWallet ?? "").trim().toLowerCase();

    if (!reserveWallet) {
      throw new HttpError(500, "Treasury operation is missing the reserve wallet.");
    }

    input.treasuryAccount.reserveWallet = reserveWallet;
    await input.treasuryAccount.save();
    await syncWalletState({
      merchantId,
      payoutWallet: input.treasuryAccount.payoutWallet,
      reserveWallet,
    });
    return;
  }

  if (input.operation.kind === "reserve_wallet_clear") {
    input.treasuryAccount.reserveWallet = null;
    await input.treasuryAccount.save();
    await syncWalletState({
      merchantId,
      payoutWallet: input.treasuryAccount.payoutWallet,
      reserveWallet: null,
    });
    return;
  }

  if (input.operation.kind === "reserve_wallet_promote") {
    const currentPrimaryWallet = input.treasuryAccount.payoutWallet;
    const currentReserveWallet = input.treasuryAccount.reserveWallet;

    if (!currentReserveWallet) {
      throw new HttpError(409, "Reserve wallet is not configured.");
    }

    input.treasuryAccount.payoutWallet = currentReserveWallet;
    input.treasuryAccount.reserveWallet = currentPrimaryWallet;
    input.treasuryAccount.pendingPayoutWallet = null;
    input.treasuryAccount.payoutWalletChangeReadyAt = null;
    await input.treasuryAccount.save();
    await syncWalletState({
      merchantId,
      payoutWallet: currentReserveWallet,
      reserveWallet: currentPrimaryWallet,
    });
    return;
  }

  if (
    input.operation.kind === "governance_owner_add" ||
    input.operation.kind === "governance_owner_remove" ||
    input.operation.kind === "governance_threshold_change"
  ) {
    await syncTreasuryAccountOwners(
      merchantId,
      toStoredRuntimeMode(input.treasuryAccount.environment)
    );
  }
}

export async function getTreasuryByMerchantId(
  merchantId: string,
  environment: RuntimeMode = "test"
) {
  let treasuryAccount: Awaited<ReturnType<typeof ensureTreasuryAccount>> | null = null;

  try {
    treasuryAccount = await syncTreasuryAccountOwners(merchantId, environment);
  } catch {
    treasuryAccount = await TreasuryAccountModel.findOne({
      merchantId,
      ...createRuntimeModeCondition("environment", environment),
    }).exec();
  }

  const [signers, operations] = await Promise.all([
    TreasurySignerModel.find({ merchantId }).sort({ createdAt: -1 }).exec(),
    TreasuryOperationModel.find({
      merchantId,
      ...createRuntimeModeCondition("environment", environment),
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .exec(),
  ]);

  return {
    account: treasuryAccount ? toTreasuryAccountResponse(treasuryAccount) : null,
    signers: signers.map(toTreasurySignerResponse),
    operations: operations.map(toTreasuryOperationResponse),
  };
}

export async function listPayoutBatchesByMerchantId(
  merchantId: string,
  environment: RuntimeMode = "test"
) {
  const [merchant, setting, batches, pendingSettlements, eligibleSettlements] = await Promise.all([
    MerchantModel.findById(merchantId).exec(),
    getOrCreatePayoutSetting(merchantId),
    PayoutBatchModel.find({
      merchantId,
      ...createRuntimeModeCondition("environment", environment),
    })
      .sort({ createdAt: -1 })
      .limit(25)
      .exec(),
    SettlementModel.find({
      merchantId,
      status: { $in: ["queued", "confirming"] },
      payoutBatchId: null,
      ...createRuntimeModeCondition("environment", environment),
    }).exec(),
    listEligiblePayoutSettlements(merchantId, environment),
  ]);

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return {
    merchantId,
    environment,
    payoutWallet: merchant.payoutWallet,
    payoutMode: setting.treasury.payoutMode,
    autoPayoutFrequency: setting.treasury.autoPayoutFrequency,
    autoPayoutTimeLocal: setting.treasury.autoPayoutTimeLocal,
    thresholdPayoutEnabled: setting.treasury.thresholdPayoutEnabled,
    autoPayoutThresholdUsdc: setting.treasury.autoPayoutThresholdUsdc,
    availableBalanceUsdc: eligibleSettlements.reduce(
      (total, settlement) => total + settlement.netUsdc,
      0
    ),
    pendingSettlementUsdc: pendingSettlements.reduce(
      (total, settlement) => total + settlement.netUsdc,
      0
    ),
    batches: batches.map(toPayoutBatchResponse),
  };
}

export async function previewPayoutBatch(input: {
  merchantId: string;
  environment: RuntimeMode;
  trigger?: PayoutBatchPreviewInput["trigger"];
}) {
  const [merchant, setting, existingBatch, settlements, protocolFeeBps] = await Promise.all([
    MerchantModel.findById(input.merchantId).exec(),
    getOrCreatePayoutSetting(input.merchantId),
    PayoutBatchModel.findOne({
      merchantId: input.merchantId,
      status: { $in: ["open", "pending_governance"] },
      ...createRuntimeModeCondition("environment", input.environment),
    })
      .sort({ createdAt: -1 })
      .exec(),
    listEligiblePayoutSettlements(input.merchantId, input.environment),
    getProtocolFeeBps(input.environment),
  ]);

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  if (existingBatch) {
    return {
      payoutWallet: merchant.payoutWallet,
      payoutMode: setting.treasury.payoutMode,
      preview: toPayoutBatchResponse(existingBatch),
      availableSettlementIds: existingBatch.settlementIds.map((entry) => entry.toString()),
    };
  }

  if (settlements.length === 0) {
    return {
      payoutWallet: merchant.payoutWallet,
      payoutMode: setting.treasury.payoutMode,
      preview: null,
      availableSettlementIds: [],
    };
  }

  const totals = buildPayoutBatchTotals(settlements, BigInt(protocolFeeBps));

  return {
    payoutWallet: merchant.payoutWallet,
    payoutMode: setting.treasury.payoutMode,
    preview: {
      id: null,
      merchantId: input.merchantId,
      environment: input.environment,
      destinationWallet: merchant.payoutWallet,
      status: "preview",
      trigger: input.trigger ?? "manual",
      settlementIds: settlements.map((entry) => entry._id.toString()),
      settlementCount: settlements.length,
      grossUsdc: totals.grossUsdc,
      feeUsdc: totals.feeUsdc,
      netUsdc: totals.netUsdc,
      txHash: null,
      openedAt: null,
      executedAt: null,
      createdAt: null,
      updatedAt: null,
    },
    availableSettlementIds: settlements.map((entry) => entry._id.toString()),
  };
}

export async function updateTreasuryPayoutSettings(input: {
  merchantId: string;
  actor: string;
  requesterTeamMemberId: string;
  environment: RuntimeMode;
  payload: PayoutSettingsInput;
}) {
  await ensureOwnerTeamMember({
    merchantId: input.merchantId,
    teamMemberId: input.requesterTeamMemberId,
  });

  const setting = await getOrCreatePayoutSetting(input.merchantId);

  setting.treasury.payoutMode = input.payload.payoutMode;
  setting.treasury.autoPayoutFrequency =
    input.payload.payoutMode === "automatic"
      ? input.payload.autoPayoutFrequency ?? setting.treasury.autoPayoutFrequency
      : null;
  if (input.payload.autoPayoutTimeLocal !== undefined) {
    setting.treasury.autoPayoutTimeLocal = input.payload.autoPayoutTimeLocal;
  }
  if (input.payload.thresholdPayoutEnabled !== undefined) {
    setting.treasury.thresholdPayoutEnabled = input.payload.thresholdPayoutEnabled;
  }
  if (input.payload.autoPayoutThresholdUsdc !== undefined) {
    setting.treasury.autoPayoutThresholdUsdc = input.payload.autoPayoutThresholdUsdc;
  }
  await setting.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Updated treasury payout settings",
    category: "treasury",
    status: "ok",
    target: input.merchantId,
    detail: "Treasury payout settings were updated.",
    metadata: {
      payoutMode: setting.treasury.payoutMode,
      autoPayoutFrequency: setting.treasury.autoPayoutFrequency,
      autoPayoutTimeLocal: setting.treasury.autoPayoutTimeLocal,
      thresholdPayoutEnabled: setting.treasury.thresholdPayoutEnabled,
      autoPayoutThresholdUsdc: setting.treasury.autoPayoutThresholdUsdc,
      environment: input.environment,
    },
    ipAddress: null,
    userAgent: null,
  });

  return listPayoutBatchesByMerchantId(input.merchantId, input.environment);
}

export async function withdrawPayoutBatch(input: {
  merchantId: string;
  actor: string;
  requesterTeamMemberId: string;
  environment: RuntimeMode;
  payload: WithdrawPayoutBatchInput;
}) {
  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "withdrawing treasury balances",
    input.environment
  );

  const [merchant, preview, protocolFeeBps] = await Promise.all([
    MerchantModel.findById(input.merchantId).exec(),
    previewPayoutBatch({
      merchantId: input.merchantId,
      environment: input.environment,
      trigger: input.payload.trigger,
    }),
    getProtocolFeeBps(input.environment),
  ]);

  await ensureOwnerTeamMember({
    merchantId: input.merchantId,
    teamMemberId: input.requesterTeamMemberId,
  });

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  if (!preview.preview || !preview.preview.settlementIds.length) {
    throw new HttpError(409, "There are no eligible settlements to withdraw.");
  }

  const { treasuryAccount, activeOwnerCount } =
    await ensureApprovalWorkflowTreasuryAccount(
      input.merchantId,
      input.environment
    );

  const existingBatch =
    preview.preview.id &&
    typeof preview.preview.id === "string"
      ? await PayoutBatchModel.findById(preview.preview.id).exec()
      : null;
  const settlements =
    existingBatch && existingBatch.settlementIds.length > 0
      ? await SettlementModel.find({
          _id: { $in: existingBatch.settlementIds },
          merchantId: input.merchantId,
          ...createRuntimeModeCondition("environment", input.environment),
        }).exec()
      : await SettlementModel.find({
          _id: { $in: preview.preview.settlementIds },
          merchantId: input.merchantId,
          ...createRuntimeModeCondition("environment", input.environment),
        }).exec();
  const totals = buildPayoutBatchTotals(settlements, BigInt(protocolFeeBps));

  let batch = existingBatch;

  if (!batch) {
    batch = await PayoutBatchModel.create({
      merchantId: new Types.ObjectId(input.merchantId),
      environment: input.environment,
      destinationWallet: merchant.payoutWallet,
      status: "pending_governance",
      trigger: input.payload.trigger,
      settlementIds: settlements.map((entry) => entry._id),
      grossUsdc: totals.grossUsdc,
      feeUsdc: totals.feeUsdc,
      netUsdc: totals.netUsdc,
      txHash: null,
      openedAt: new Date(),
      executedAt: null,
    });

    // Only claim settlements that are still unclaimed (payoutBatchId: null).
    // This guards against a concurrent withdraw request creating a duplicate batch
    // for the same settlements — the second request will see modifiedCount === 0 and fail.
    const claimResult = await SettlementModel.updateMany(
      {
        _id: { $in: settlements.map((entry) => entry._id) },
        payoutBatchId: null,
      },
      {
        $set: {
          payoutBatchId: batch._id,
        },
      }
    ).exec();

    if (claimResult.modifiedCount === 0) {
      await PayoutBatchModel.findByIdAndDelete(batch._id).exec();
      throw new HttpError(
        409,
        "These settlements were claimed by a concurrent withdrawal. Refresh and try again."
      );
    }
  }

  const existingOperation = await TreasuryOperationModel.findOne({
    merchantId: input.merchantId,
    kind: "payout_batch_withdraw",
    status: { $in: ["pending_signatures", "approved", "executed"] },
    "metadata.batchId": batch._id.toString(),
    ...createRuntimeModeCondition("environment", input.environment),
  }).exec();

  if (!existingOperation) {
    const operation = await TreasuryOperationModel.create({
      merchantId: new Types.ObjectId(input.merchantId),
      environment: input.environment,
      treasuryAccountId: treasuryAccount._id,
      settlementId: null,
      kind: "payout_batch_withdraw",
      status: "pending_signatures",
      governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
      governanceVaultAddress: treasuryAccount.governanceVaultAddress,
      threshold: treasuryAccount.threshold,
      targetAddress: getProtocolProgramAddress(input.environment),
      value: "0",
      data: encodeWithdrawCallBaseUnits(totals.withdrawBaseUnits),
      origin: `payout-batch:${batch._id.toString()}`,
      createdBy: input.actor,
      signatures: [],
      metadata: {
        batchId: batch._id.toString(),
        settlementIds: settlements.map((entry) => entry._id.toString()),
        destinationWallet: merchant.payoutWallet,
        grossSettlementUsdc: totals.grossUsdc,
        protocolFeeBps: Number(protocolFeeBps),
        protocolFeeUsdc: totals.feeUsdc,
        netUsdc: totals.netUsdc,
      },
    });

    await queueTreasuryApprovalNeededNotification({
      merchantId: input.merchantId,
      environment: input.environment,
      operationId: operation._id.toString(),
    }).catch(() => undefined);
  }

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Opened payout batch withdrawal",
    category: "treasury",
    status: "ok",
    target: batch._id.toString(),
    detail:
      activeOwnerCount > 1
        ? "Payout batch queued for owner approvals."
        : "Payout batch queued for owner approval.",
    metadata: {
      batchId: batch._id.toString(),
      trigger: input.payload.trigger,
      settlementCount: settlements.length,
      netUsdc: totals.netUsdc,
      approvalMode: activeOwnerCount > 1 ? "multisig" : "single_owner",
      governanceEnabled: true,
    },
    ipAddress: null,
    userAgent: null,
  });

  const refreshedBatch = await PayoutBatchModel.findById(batch._id).exec();

  if (!refreshedBatch) {
    throw new HttpError(404, "Payout batch was not found.");
  }

  await queuePayoutBatchNotification({
    merchantId: input.merchantId,
    environment: input.environment,
    batchId: refreshedBatch._id.toString(),
    templateKey:
      refreshedBatch.status === "executed"
        ? "merchant.treasury.payout_completed"
        : "merchant.treasury.payout_batch_opened",
  }).catch(() => undefined);

  return {
    batch: toPayoutBatchResponse(refreshedBatch),
    treasury: await listPayoutBatchesByMerchantId(input.merchantId, input.environment),
  };
}

export async function createTreasurySignerChallenge(input: {
  merchantId: string;
  teamMemberId: string;
  payload: CreateTreasurySignerChallengeInput;
}) {
  const member = await ensureOwnerTeamMember({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
  });

  const walletAddress = normalizeAddress(input.payload.walletAddress);
  const nonce = randomBytes(16).toString("hex");
  const message = buildSignerChallengeMessage({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    walletAddress,
    nonce,
  });
  let signerBinding = await TreasurySignerModel.findOne({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
  }).exec();

  if (!signerBinding) {
    signerBinding = await TreasurySignerModel.create({
      merchantId: new Types.ObjectId(input.merchantId),
      teamMemberId: input.teamMemberId,
      walletAddress,
      status: "pending",
      challengeNonce: nonce,
      challengeMessage: message,
      challengeIssuedAt: new Date(),
    });
  } else {
    signerBinding.walletAddress = walletAddress;
    signerBinding.status = "pending";
    signerBinding.challengeNonce = nonce;
    signerBinding.challengeMessage = message;
    signerBinding.challengeIssuedAt = new Date();
    signerBinding.verifiedAt = null;
    signerBinding.revokedAt = null;
    await signerBinding.save();
  }

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: resolveTeamMemberActor(member),
    action: "Requested treasury signer challenge",
    category: "security",
    status: "ok",
    target: walletAddress,
    detail: "Treasury signer challenge generated.",
    metadata: {
      teamMemberId: input.teamMemberId,
      walletAddress,
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    signer: toTreasurySignerResponse(signerBinding),
    challengeMessage: message,
  };
}

export async function verifyTreasurySigner(input: {
  merchantId: string;
  teamMemberId: string;
  payload: VerifyTreasurySignerInput;
}) {
  const [member, signerBinding] = await Promise.all([
    ensureOwnerTeamMember({
      merchantId: input.merchantId,
      teamMemberId: input.teamMemberId,
    }),
    TreasurySignerModel.findOne({
      merchantId: input.merchantId,
      teamMemberId: input.teamMemberId,
    }).exec(),
  ]);

  if (!signerBinding || !signerBinding.challengeMessage) {
    throw new HttpError(409, "Treasury signer challenge is not active.");
  }

  const isValid = nacl.sign.detached.verify(
    Buffer.from(signerBinding.challengeMessage, "utf8"),
    bs58.decode(input.payload.signature),
    bs58.decode(signerBinding.walletAddress)
  );

  if (!isValid) {
    throw new HttpError(401, "Treasury signer signature is invalid.");
  }

  signerBinding.status = "active";
  signerBinding.verifiedAt = new Date();
  signerBinding.challengeNonce = null;
  signerBinding.challengeMessage = null;
  signerBinding.challengeIssuedAt = null;
  await signerBinding.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: resolveTeamMemberActor(member),
    action: "Verified treasury signer",
    category: "security",
    status: "ok",
    target: signerBinding.walletAddress,
    detail: "Treasury signer binding verified.",
    metadata: {
      teamMemberId: input.teamMemberId,
      walletAddress: signerBinding.walletAddress,
    },
    ipAddress: null,
    userAgent: null,
  });

  await syncOwnerTreasuryGovernance({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    requesterTeamMemberId: input.teamMemberId,
    actor: resolveTeamMemberActor(member),
  });

  return toTreasurySignerResponse(signerBinding);
}

export async function revokeTreasurySigner(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  requesterTeamMemberId: string;
}) {
  await ensureOwnerTeamMember({
    merchantId: input.merchantId,
    teamMemberId: input.requesterTeamMemberId,
  });

  const signerBinding = await TreasurySignerModel.findOne({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
  }).exec();

  if (!signerBinding) {
    throw new HttpError(404, "Treasury signer binding was not found.");
  }

  signerBinding.status = "revoked";
  signerBinding.revokedAt = new Date();
  signerBinding.challengeNonce = null;
  signerBinding.challengeMessage = null;
  signerBinding.challengeIssuedAt = null;
  await signerBinding.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Revoked treasury signer",
    category: "security",
    status: "warning",
    target: signerBinding.walletAddress,
    detail: "Treasury signer binding revoked.",
    metadata: {
      teamMemberId: input.teamMemberId,
      walletAddress: signerBinding.walletAddress,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toTreasurySignerResponse(signerBinding);
}

export async function bootstrapTreasuryAccount(input: {
  merchantId: string;
  actor: string;
  requesterTeamMemberId: string;
  payload: BootstrapTreasuryInput;
}) {
  await ensureOwnerTeamMember({
    merchantId: input.merchantId,
    teamMemberId: input.requesterTeamMemberId,
  });

  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "configuring merchant treasury custody",
    input.payload.environment
  );

  const merchant = await getMerchantOrThrow(input.merchantId);
  let governance:
    | {
      governanceMultisigAddress: string;
      governanceVaultAddress: string;
      governanceVaultIndex: number;
      ownerAddresses: string[];
      threshold: number;
    }
    | undefined;
  let operator:
    | {
      operatorMultisigAddress: string;
      operatorVaultAddress: string;
      operatorVaultIndex: number;
    }
    | null = null;

  if (input.payload.mode === "create") {
    const ownerIds = [...new Set(input.payload.ownerTeamMemberIds)];
    const signerBindings = await TreasurySignerModel.find({
      merchantId: input.merchantId,
      teamMemberId: { $in: ownerIds },
      status: "active",
    }).exec();

    if (signerBindings.length !== ownerIds.length) {
      throw new HttpError(
        409,
        "Every treasury owner must have an active verified signer wallet."
      );
    }

    const owners = signerBindings.map((entry) => normalizeAddress(entry.walletAddress));
    const threshold =
      input.payload.threshold ?? Math.min(owners.length, owners.length > 1 ? 2 : 1);

    assertMultiOwnerThreshold({
      ownerCount: owners.length,
      threshold,
      message:
        "Treasury governance for multiple owners must require at least two approvals.",
    });

    governance = await createSquadsGovernanceVault({
      environment: input.payload.environment,
      ownerAddresses: owners,
      threshold,
    });
  } else {
    if (!input.payload.governanceMultisigAddress) {
      throw new HttpError(
        409,
        "A governance multisig address is required to import treasury custody."
      );
    }

    governance = await loadSquadsGovernanceSnapshot({
      environment: input.payload.environment,
      governanceMultisigAddress: input.payload.governanceMultisigAddress,
    });

    assertMultiOwnerThreshold({
      ownerCount: governance.ownerAddresses.length,
      threshold: governance.threshold,
      message:
        "Imported treasury governance must require at least two approvals when multiple owners are configured.",
    });
  }

  const conflictingTreasury = await TreasuryAccountModel.findOne({
    $or: [
      {
        governanceMultisigAddress: normalizeAddress(
          governance.governanceMultisigAddress
        ),
      },
      {
        governanceVaultAddress: normalizeAddress(
          governance.governanceVaultAddress
        ),
      },
    ],
    ...createRuntimeModeCondition("environment", input.payload.environment),
    merchantId: { $ne: merchant._id },
  })
    .select({ _id: 1 })
    .lean()
    .exec();

  if (conflictingTreasury) {
    throw new HttpError(
      409,
      "This governance vault is already bound to another merchant workspace."
    );
  }

  let treasuryAccount = await TreasuryAccountModel.findOne({
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.payload.environment),
  }).exec();

  if (
    !treasuryAccount ||
    !treasuryAccount.operatorMultisigAddress?.trim() ||
    !treasuryAccount.operatorVaultAddress?.trim()
  ) {
    operator = await createSquadsOperatorVault({
      environment: input.payload.environment,
    });
  }

  if (!treasuryAccount) {
    if (!merchant.payoutWallet) {
      throw new HttpError(409, "Merchant payout wallet is not configured.");
    }

    treasuryAccount = await createTreasuryAccountFromGovernanceVault({
      merchantId: input.merchantId,
      environment: input.payload.environment,
      governanceMultisigAddress: governance.governanceMultisigAddress,
      governanceVaultAddress: governance.governanceVaultAddress,
      governanceVaultIndex: governance.governanceVaultIndex,
      operatorMultisigAddress: operator!.operatorMultisigAddress,
      operatorVaultAddress: operator!.operatorVaultAddress,
      operatorVaultIndex: operator!.operatorVaultIndex,
      owners: governance.ownerAddresses,
      threshold: governance.threshold,
      payoutWallet: merchant.payoutWallet,
      reserveWallet: merchant.reserveWallet ?? null,
    });
  } else {
    treasuryAccount.governanceMultisigAddress = normalizeAddress(
      governance.governanceMultisigAddress
    );
    treasuryAccount.governanceVaultAddress = normalizeAddress(
      governance.governanceVaultAddress
    );
    treasuryAccount.governanceVaultIndex = governance.governanceVaultIndex;
    if (operator) {
      treasuryAccount.operatorMultisigAddress = normalizeAddress(
        operator.operatorMultisigAddress
      );
      treasuryAccount.operatorVaultAddress = normalizeAddress(
        operator.operatorVaultAddress
      );
      treasuryAccount.operatorVaultIndex = operator.operatorVaultIndex;
    }
    treasuryAccount.ownerAddresses = governance.ownerAddresses.map(normalizeAddress);
    treasuryAccount.threshold = governance.threshold;
    treasuryAccount.network = "solana";
    treasuryAccount.lastSyncedAt = new Date();
    await treasuryAccount.save();
  }

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Configured treasury governance vault",
    category: "security",
    status: "ok",
    target: governance.governanceVaultAddress,
    detail:
      input.payload.mode === "create"
        ? "Treasury governance vault created for the merchant."
        : "Treasury governance vault imported for the merchant.",
    metadata: {
      governanceMultisigAddress: governance.governanceMultisigAddress,
      governanceVaultAddress: governance.governanceVaultAddress,
      threshold: governance.threshold,
      ownerCount: governance.ownerAddresses.length,
      mode: input.payload.mode,
      environment: input.payload.environment,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toTreasuryAccountResponse(treasuryAccount);
}

export async function createSettlementSweepOperation(input: {
  merchantId: string;
  settlementId: string;
  actor: string;
  environment: RuntimeMode;
}) {
  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "requesting settlement sweep approvals",
    input.environment
  );

  const [settlement, treasuryAccount, protocolFeeBps] = await Promise.all([
    SettlementModel.findOne({
      _id: input.settlementId,
      merchantId: input.merchantId,
      ...createRuntimeModeCondition("environment", input.environment),
    }).exec(),
    ensureTreasuryAccount(input.merchantId, input.environment),
    getProtocolFeeBps(input.environment),
  ]);

  if (!settlement) {
    throw new HttpError(404, "Settlement was not found.");
  }

  const existing = await TreasuryOperationModel.findOne({
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
    settlementId: input.settlementId,
    kind: "settlement_sweep",
    status: { $in: ["pending_signatures", "approved", "executed"] },
  }).exec();

  if (existing) {
    return toTreasuryOperationResponse(existing);
  }

  const protocolAddress = getProtocolProgramAddress(input.environment);
  const protocolAmountUsdc =
    typeof settlement.protocolAmountUsdc === "number" &&
      Number.isFinite(settlement.protocolAmountUsdc) &&
      settlement.protocolAmountUsdc > 0
      ? settlement.protocolAmountUsdc
      : settlement.netUsdc;
  const grossBaseUnits = toUsdcBaseUnits(protocolAmountUsdc);
  const protocolFeeBaseUnits =
    (grossBaseUnits * BigInt(protocolFeeBps)) / 10_000n;
  const withdrawBaseUnits = grossBaseUnits - protocolFeeBaseUnits;

  if (withdrawBaseUnits <= 0n) {
    throw new HttpError(
      409,
      "Settlement net amount is too low after protocol fees to queue a treasury sweep."
    );
  }

  const operation = await TreasuryOperationModel.create({
    merchantId: new Types.ObjectId(input.merchantId),
    environment: input.environment,
    treasuryAccountId: treasuryAccount._id,
    settlementId: settlement._id,
    kind: "settlement_sweep",
    status: "pending_signatures",
    governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
    governanceVaultAddress: treasuryAccount.governanceVaultAddress,
    threshold: treasuryAccount.threshold,
    targetAddress: normalizeAddress(protocolAddress),
    value: "0",
    data: encodeWithdrawCallBaseUnits(withdrawBaseUnits),
    origin: `settlement:${settlement.batchRef}`,
    createdBy: input.actor,
    signatures: [],
    metadata: {
      batchRef: settlement.batchRef,
      grossSettlementUsdc: protocolAmountUsdc,
      protocolFeeBps: Number(protocolFeeBps),
      protocolFeeUsdc: fromUsdcBaseUnits(protocolFeeBaseUnits),
      netUsdc: fromUsdcBaseUnits(withdrawBaseUnits),
      protocolExecutionKind: settlement.protocolExecutionKind ?? "invoice_settlement",
      protocolChargeId: settlement.protocolChargeId ?? null,
      destinationWallet: treasuryAccount.payoutWallet,
    },
  });

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Created settlement sweep operation",
    category: "treasury",
    status: "ok",
    target: settlement.batchRef,
    detail: "Settlement sweep is waiting for treasury signatures.",
    metadata: {
      settlementId: settlement._id.toString(),
      treasuryOperationId: operation._id.toString(),
      threshold: treasuryAccount.threshold,
    },
    ipAddress: null,
    userAgent: null,
  });

  if (operation.status === "approved") {
    await queueTreasuryOperationStatusNotification({
      merchantId: input.merchantId,
      environment: toStoredRuntimeMode(treasuryAccount.environment),
      operationId: operation._id.toString(),
      status: "approved",
    }).catch(() => undefined);
  }

  return toTreasuryOperationResponse(operation);
}

export async function addTreasuryOwner(input: {
  merchantId: string;
  actor: string;
  requesterTeamMemberId: string;
  payload: AddTreasuryOwnerInput;
}) {
  await ensureOwnerTeamMember({
    merchantId: input.merchantId,
    teamMemberId: input.requesterTeamMemberId,
  });

  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "adding treasury governance approvers",
    input.payload.environment
  );

  const [treasuryAccount, member, signerBinding] = await Promise.all([
    ensureTreasuryAccount(input.merchantId, input.payload.environment),
    getTeamMemberOrThrow(input.merchantId, input.payload.teamMemberId),
    findTreasurySignerBinding({
      merchantId: input.merchantId,
      teamMemberId: input.payload.teamMemberId,
    }),
  ]);

  if (member.status !== "active") {
    throw new HttpError(409, "Team member must be active before becoming a treasury owner.");
  }

  if (member.role !== "owner") {
    throw new HttpError(409, "Only workspace owners can become treasury approvers.");
  }

  if (!signerBinding || signerBinding.status !== "active") {
    throw new HttpError(
      409,
      "Team member must have an active verified treasury signer wallet."
    );
  }

  const ownerWallet = normalizeAddress(signerBinding.walletAddress);

  if (treasuryAccount.ownerAddresses.includes(ownerWallet)) {
    throw new HttpError(409, "This signer is already an approver on the governance vault.");
  }

  const nextOwnerCount = treasuryAccount.ownerAddresses.length + 1;
  const threshold = input.payload.threshold ?? treasuryAccount.threshold;

  if (threshold < 1 || threshold > nextOwnerCount) {
    throw new HttpError(409, "Threshold cannot exceed the governance approver count.");
  }

  assertMultiOwnerThreshold({
    ownerCount: nextOwnerCount,
    threshold,
  });

  return createGovernanceOperation({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.payload.environment,
    kind: "governance_owner_add",
    targetTeamMemberId: input.payload.teamMemberId,
    metadata: {
      teamMemberId: input.payload.teamMemberId,
      teamMemberName: resolveTeamMemberActor(member),
      teamMemberEmail: member.email,
      walletAddress: ownerWallet,
      nextThreshold: threshold,
    },
  });
}

export async function removeTreasuryOwner(input: {
  merchantId: string;
  teamMemberId: string;
  actor: string;
  requesterTeamMemberId: string;
  payload: RemoveTreasuryOwnerInput;
}) {
  await ensureOwnerTeamMember({
    merchantId: input.merchantId,
    teamMemberId: input.requesterTeamMemberId,
  });

  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "removing treasury governance approvers",
    input.payload.environment
  );

  const [treasuryAccount, member, signerBinding] = await Promise.all([
    ensureTreasuryAccount(input.merchantId, input.payload.environment),
    getTeamMemberOrThrow(input.merchantId, input.teamMemberId),
    findTreasurySignerBinding({
      merchantId: input.merchantId,
      teamMemberId: input.teamMemberId,
    }),
  ]);

  if (!signerBinding) {
    throw new HttpError(404, "Treasury signer binding was not found for this team member.");
  }

  const ownerWallet = normalizeAddress(signerBinding.walletAddress);

  if (!treasuryAccount.ownerAddresses.includes(ownerWallet)) {
    throw new HttpError(409, "This team member is not an approver on the governance vault.");
  }

  const nextOwnerCount = treasuryAccount.ownerAddresses.length - 1;

  if (nextOwnerCount < 1) {
    throw new HttpError(409, "The governance vault must keep at least one approver.");
  }

  const threshold =
    input.payload.threshold ?? Math.min(treasuryAccount.threshold, nextOwnerCount);

  if (threshold < 1 || threshold > nextOwnerCount) {
    throw new HttpError(409, "Threshold cannot exceed the remaining owner count.");
  }

  assertMultiOwnerThreshold({
    ownerCount: nextOwnerCount,
    threshold,
  });

  return createGovernanceOperation({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.payload.environment,
    kind: "governance_owner_remove",
    targetTeamMemberId: input.teamMemberId,
    metadata: {
      teamMemberId: input.teamMemberId,
      teamMemberName: resolveTeamMemberActor(member),
      teamMemberEmail: member.email,
      walletAddress: ownerWallet,
      nextThreshold: threshold,
    },
  });
}

export async function updateTreasuryThreshold(input: {
  merchantId: string;
  actor: string;
  requesterTeamMemberId: string;
  payload: UpdateTreasuryThresholdInput;
}) {
  await ensureOwnerTeamMember({
    merchantId: input.merchantId,
    teamMemberId: input.requesterTeamMemberId,
  });

  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "changing treasury governance threshold",
    input.payload.environment
  );

  const treasuryAccount = await ensureTreasuryAccount(
    input.merchantId,
    input.payload.environment
  );

  if (
    input.payload.threshold < 1 ||
    input.payload.threshold > treasuryAccount.ownerAddresses.length
  ) {
    throw new HttpError(409, "Threshold cannot exceed the governance approver count.");
  }

  assertMultiOwnerThreshold({
    ownerCount: treasuryAccount.ownerAddresses.length,
    threshold: input.payload.threshold,
  });

  if (input.payload.threshold === treasuryAccount.threshold) {
    throw new HttpError(409, "Treasury threshold is already set to this value.");
  }

  return createGovernanceOperation({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.payload.environment,
    kind: "governance_threshold_change",
    metadata: {
      previousThreshold: treasuryAccount.threshold,
      nextThreshold: input.payload.threshold,
    },
  });
}

async function createWalletOperation(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
  kind: string;
  targetAddress: string;
  data: string;
  metadata?: Record<string, unknown>;
}) {
  const { treasuryAccount } = await ensureApprovalWorkflowTreasuryAccount(
    input.merchantId,
    input.environment
  );
  const existingOperation = await TreasuryOperationModel.findOne({
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
    kind: input.kind,
    targetAddress: normalizeAddress(input.targetAddress),
    data: input.data,
    status: {
      $in: ["pending_signatures", "approved"],
    },
  }).exec();

  if (existingOperation) {
    return toTreasuryOperationResponse(existingOperation);
  }

  const operation = await TreasuryOperationModel.create({
    merchantId: new Types.ObjectId(input.merchantId),
    environment: input.environment,
    treasuryAccountId: treasuryAccount._id,
    settlementId: null,
    kind: input.kind,
    status: "pending_signatures",
    governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
    governanceVaultAddress: treasuryAccount.governanceVaultAddress,
    threshold: treasuryAccount.threshold,
    targetAddress: normalizeAddress(input.targetAddress),
    value: "0",
    data: input.data,
    origin: `settings:${input.kind}`,
    createdBy: input.actor,
    signatures: [],
    metadata: input.metadata ?? {},
  });

  await queueTreasuryApprovalNeededNotification({
    merchantId: input.merchantId,
    environment: input.environment,
    operationId: operation._id.toString(),
  }).catch(() => undefined);

  return toTreasuryOperationResponse(operation);
}

export async function queueMerchantRegistrationOperation(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
}) {
  const [merchant, treasuryAccount] = await Promise.all([
    getMerchantOrThrow(input.merchantId),
    ensureTreasuryAccount(input.merchantId, input.environment),
  ]);

  if (
    await isProtocolMerchantRegistered(
      input.environment,
      input.merchantId
    )
  ) {
    return null;
  }

  const existingOperation = await TreasuryOperationModel.findOne({
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
    kind: "merchant_register",
    status: { $in: ["pending_signatures", "approved"] },
  }).exec();

  if (existingOperation) {
    return toTreasuryOperationResponse(existingOperation);
  }

  if (!merchant.payoutWallet) {
    throw new HttpError(409, "Merchant payout wallet is not configured.");
  }

  return createWalletOperation({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.environment,
    kind: "merchant_register",
    targetAddress: getProtocolProgramAddress(input.environment),
    data: encodeMerchantRegisterCall({
      payoutWallet: merchant.payoutWallet,
      reserveWallet: merchant.reserveWallet ?? "",
      metadataHash: merchant.metadataHash,
    }),
    metadata: {
      entityType: "merchant",
      payoutWallet: merchant.payoutWallet,
      reserveWallet: merchant.reserveWallet,
      metadataHash: merchant.metadataHash,
    },
  });
}

async function ensureProtocolMerchantReady(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
}) {
  try {
    const treasuryAccount = await ensureProtocolOperatorVault(
      input.merchantId,
      input.environment
    );
    const merchantRegistered = await isProtocolMerchantRegistered(
      input.environment,
      input.merchantId
    );

    if (merchantRegistered) {
      return {
        ready: true as const,
        treasuryAccount,
        registrationOperation: null,
      };
    }

    return {
      ready: false as const,
      treasuryAccount,
      registrationOperation: await queueMerchantRegistrationOperation(input),
    };
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 409) {
      return {
        ready: false as const,
        treasuryAccount: null,
        registrationOperation: null,
      };
    }

    throw error;
  }
}

async function queueMerchantSubscriptionOperatorAuthorization(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
}) {
  return null;
}

export async function ensureMerchantSubscriptionOperatorReady(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
}) {
  const readiness = await ensureProtocolMerchantReady(input);

  if (!readiness.treasuryAccount) {
    return {
      ready: false as const,
      merchantReady: false as const,
      treasuryAccount: null,
      registrationOperation: readiness.registrationOperation,
      operatorAuthorizationOperation: null,
      operatorAddress: getRenewSubscriptionOperatorAddress(input.environment),
    };
  }

  if (!readiness.ready) {
    return {
      ready: false as const,
      merchantReady: false as const,
      treasuryAccount: readiness.treasuryAccount,
      registrationOperation: readiness.registrationOperation,
      operatorAuthorizationOperation: null,
      operatorAddress: getRenewSubscriptionOperatorAddress(input.environment),
    };
  }

  return {
    ready: true as const,
    merchantReady: true as const,
    treasuryAccount: readiness.treasuryAccount,
    registrationOperation: null,
    operatorAuthorizationOperation: null,
    operatorAddress: getRenewSubscriptionOperatorAddress(input.environment),
  };
}

export async function queuePlanProtocolSync(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
  planId: string;
}) {
  const plan = await PlanModel.findOne({
    _id: input.planId,
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
  }).exec();

  if (!plan) {
    throw new HttpError(404, "Plan was not found.");
  }

  const targetStatus = (plan.pendingStatus ?? plan.status).trim();

  if (!plan.protocolPlanId && targetStatus !== "active") {
    plan.protocolSyncStatus = "not_synced";
    plan.protocolOperationId = null;
    plan.protocolTxHash = null;
    await plan.save();
    return null;
  }

  const readiness = await ensureProtocolMerchantReady({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.environment,
  });

  if (!readiness.treasuryAccount) {
    plan.protocolSyncStatus = "not_configured";
    plan.protocolOperationId = null;
    plan.protocolTxHash = null;
    await plan.save();
    return null;
  }

  if (!readiness.ready) {
    plan.protocolSyncStatus = "blocked_merchant_registration";
    plan.protocolOperationId = null;
    plan.protocolTxHash = null;
    await plan.save();
    return readiness.registrationOperation;
  }

  await queueMerchantSubscriptionOperatorAuthorization({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.environment,
  }).catch(() => null);

  const maxRetryCount = await getMerchantMaxRetryCount(input.merchantId);
  const operation = await createWalletOperation({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.environment,
    kind: plan.protocolPlanId ? "plan_update" : "plan_create",
    targetAddress: getProtocolProgramAddress(input.environment),
    data: plan.protocolPlanId
      ? encodePlanUpdateCall({
        protocolPlanId: plan.protocolPlanId,
        usdAmount: plan.usdAmount,
        billingIntervalDays: plan.billingIntervalDays,
        trialDays: plan.trialDays,
        retryWindowHours: plan.retryWindowHours,
        maxRetryCount,
        billingMode: plan.billingMode,
        usageRate: plan.usageRate ?? null,
        active: targetStatus === "active",
      })
      : encodePlanCreateCall({
        planCode: plan.planCode,
        usdAmount: plan.usdAmount,
        billingIntervalDays: plan.billingIntervalDays,
        trialDays: plan.trialDays,
        retryWindowHours: plan.retryWindowHours,
        maxRetryCount,
        billingMode: plan.billingMode,
        usageRate: plan.usageRate ?? null,
      }),
    metadata: {
      entityType: "plan",
      planId: plan._id.toString(),
      status: plan.status,
      targetStatus,
      maxRetryCount,
    },
  });

  plan.protocolOperationId = new Types.ObjectId(operation.id);
  plan.protocolSyncStatus =
    targetStatus === "active" && plan.status !== "active"
      ? "pending_activation"
      : targetStatus === "archived" && plan.status !== "archived"
        ? "pending_archive"
        : operation.status;
  plan.protocolTxHash = operation.txHash ?? null;
  await plan.save();

  return operation;
}

export async function queueSubscriptionProtocolCreate(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
  subscriptionId: string;
  checkoutSessionId?: string;
  triggerInitialCharge?: boolean;
}) {
  const subscription = await SubscriptionModel.findOne({
    _id: input.subscriptionId,
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
  }).exec();

  if (!subscription) {
    throw new HttpError(404, "Subscription was not found.");
  }

  if (subscription.status !== "pending_activation" && subscription.status !== "active") {
    subscription.protocolSyncStatus = "not_synced";
    subscription.protocolOperationId = null;
    subscription.protocolTxHash = null;
    await subscription.save();
    return null;
  }

  const plan = await PlanModel.findOne({
    _id: subscription.planId,
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
  }).exec();

  if (!plan) {
    throw new HttpError(404, "Plan was not found.");
  }

  if (!plan.protocolPlanId || plan.protocolSyncStatus !== "synced" || plan.status !== "active") {
    await queuePlanProtocolSync({
      merchantId: input.merchantId,
      actor: input.actor,
      environment: input.environment,
      planId: plan._id.toString(),
    });
    subscription.protocolSyncStatus = "blocked_plan_sync";
    subscription.protocolOperationId = null;
    subscription.protocolTxHash = null;
    await subscription.save();
    return null;
  }

  const readiness = await ensureMerchantSubscriptionOperatorReady({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.environment,
  });

  if (!readiness.treasuryAccount) {
    subscription.protocolSyncStatus = "not_configured";
    subscription.protocolOperationId = null;
    subscription.protocolTxHash = null;
    await subscription.save();
    return null;
  }

  if (!readiness.ready) {
    subscription.protocolSyncStatus = readiness.merchantReady
      ? "blocked_operator_authorization"
      : "blocked_merchant_registration";
    subscription.protocolOperationId = null;
    subscription.protocolTxHash = null;
    await subscription.save();
    return null;
  }

  const mandateHash = deriveProtocolMandateHash({
    customerRef: subscription.customerRef,
    paymentAccountType: subscription.paymentAccountType,
    paymentAccountNumber: subscription.paymentAccountNumber ?? null,
    paymentNetworkId: subscription.paymentNetworkId ?? null,
  });

  const createdOnchain = await createProtocolSubscriptionForMerchant({
    environment: input.environment,
    merchantId: input.merchantId,
    protocolPlanId: plan.protocolPlanId,
    subscriptionRef: subscription._id.toString(),
    customerRef: subscription.customerRef,
    billingCurrency: subscription.billingCurrency,
    nextChargeAt: subscription.nextChargeAt,
    localAmount: subscription.localAmount,
    mandateHash,
    ...getOperatorVaultContext(readiness.treasuryAccount),
  });

  if (!createdOnchain.protocolSubscriptionId) {
    throw new HttpError(
      502,
      "Protocol subscription creation completed without a subscription id."
    );
  }

  subscription.protocolSubscriptionId = createdOnchain.protocolSubscriptionId;
  subscription.protocolOperationId = null;
  subscription.status = "active";
  subscription.pendingStatus = null;
  subscription.protocolSyncStatus = "synced";
  subscription.protocolTxHash = createdOnchain.txHash;
  await subscription.save();

  if (input.triggerInitialCharge === true) {
    const { runSubscriptionChargeJob } = await import(
      "@/features/charges/charge.service"
    );
    const chargeResult = await runSubscriptionChargeJob({
      subscriptionId: subscription._id.toString(),
    });

    if (input.checkoutSessionId) {
      await syncCheckoutSessionWithChargeResult({
        checkoutSessionId: input.checkoutSessionId,
        billingCurrency: subscription.billingCurrency,
        chargeResult,
      });
    }
  }

  return {
    protocolSubscriptionId: createdOnchain.protocolSubscriptionId,
    txHash: createdOnchain.txHash,
  };
}

async function queueSubscriptionProtocolOperation(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
  subscriptionId: string;
  kind:
  | "subscription_pause"
  | "subscription_resume"
  | "subscription_cancel"
  | "subscription_mandate_update";
}) {
  const subscription = await SubscriptionModel.findOne({
    _id: input.subscriptionId,
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
  }).exec();

  if (!subscription) {
    throw new HttpError(404, "Subscription was not found.");
  }

  if (!subscription.protocolSubscriptionId) {
    return queueSubscriptionProtocolCreate({
      merchantId: input.merchantId,
      actor: input.actor,
      environment: input.environment,
      subscriptionId: input.subscriptionId,
    });
  }

  const readiness = await ensureMerchantSubscriptionOperatorReady({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.environment,
  });

  if (!readiness.treasuryAccount) {
    subscription.protocolSyncStatus = "not_configured";
    subscription.protocolOperationId = null;
    subscription.protocolTxHash = null;
    await subscription.save();
    return null;
  }

  if (!readiness.ready) {
    subscription.protocolSyncStatus = readiness.merchantReady
      ? "blocked_operator_authorization"
      : "blocked_merchant_registration";
    subscription.protocolOperationId = null;
    subscription.protocolTxHash = null;
    await subscription.save();
    return null;
  }

  const mandateHash = deriveProtocolMandateHash({
    customerRef: subscription.customerRef,
    paymentAccountType: subscription.paymentAccountType,
    paymentAccountNumber: subscription.paymentAccountNumber ?? null,
    paymentNetworkId: subscription.paymentNetworkId ?? null,
  });
  const operatorVault = getOperatorVaultContext(readiness.treasuryAccount);
  const execution =
    input.kind === "subscription_pause"
      ? await pauseProtocolSubscription({
        environment: input.environment,
        protocolSubscriptionId: subscription.protocolSubscriptionId,
        ...operatorVault,
      })
      : input.kind === "subscription_resume"
        ? await resumeProtocolSubscription({
          environment: input.environment,
          protocolSubscriptionId: subscription.protocolSubscriptionId,
          nextChargeAt: subscription.nextChargeAt,
          ...operatorVault,
        })
        : input.kind === "subscription_cancel"
          ? await cancelProtocolSubscription({
            environment: input.environment,
            protocolSubscriptionId: subscription.protocolSubscriptionId,
            ...operatorVault,
          })
          : await updateProtocolSubscriptionMandate({
            environment: input.environment,
            protocolSubscriptionId: subscription.protocolSubscriptionId,
            mandateHash,
            ...operatorVault,
          });

  subscription.protocolOperationId = null;
  subscription.protocolSyncStatus = "synced";
  subscription.protocolTxHash = execution.txHash;

  if (input.kind === "subscription_pause") {
    subscription.status = "paused";
    subscription.pendingStatus = null;
  } else if (input.kind === "subscription_resume") {
    subscription.status = "active";
    subscription.pendingStatus = null;
  } else if (input.kind === "subscription_cancel") {
    subscription.status = "cancelled";
    subscription.pendingStatus = null;
  } else {
    subscription.pendingStatus = null;
  }

  await subscription.save();

  return execution;
}

export async function queueSubscriptionProtocolPause(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
  subscriptionId: string;
}) {
  return queueSubscriptionProtocolOperation({
    ...input,
    kind: "subscription_pause",
  });
}

export async function queueSubscriptionProtocolResume(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
  subscriptionId: string;
}) {
  return queueSubscriptionProtocolOperation({
    ...input,
    kind: "subscription_resume",
  });
}

export async function queueSubscriptionProtocolCancel(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
  subscriptionId: string;
}) {
  return queueSubscriptionProtocolOperation({
    ...input,
    kind: "subscription_cancel",
  });
}

export async function queueSubscriptionProtocolMandateUpdate(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
  subscriptionId: string;
}) {
  return queueSubscriptionProtocolOperation({
    ...input,
    kind: "subscription_mandate_update",
  });
}

async function createGovernanceOperation(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
  kind:
    | "governance_owner_add"
    | "governance_owner_remove"
    | "governance_threshold_change";
  targetTeamMemberId?: string;
  metadata: Record<string, unknown>;
}) {
  const treasuryAccount = await ensureTreasuryAccount(
    input.merchantId,
    input.environment
  );
  const operation = await createWalletOperation({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.environment,
    kind: input.kind,
    targetAddress: treasuryAccount.governanceMultisigAddress,
    data: JSON.stringify({
      kind: input.kind,
      metadata: input.metadata,
    }),
    metadata: input.metadata,
  });

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Queued treasury governance operation",
    category: "treasury",
    status: "ok",
    target: input.kind,
    detail: `Governance change ${input.kind} is waiting for approvals.`,
    metadata: {
      ...input.metadata,
      targetTeamMemberId: input.targetTeamMemberId ?? null,
      governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
      governanceVaultAddress: treasuryAccount.governanceVaultAddress,
    },
    ipAddress: null,
    userAgent: null,
  });

  return operation;
}

export async function createWalletUpdateOperations(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
  primaryWallet: string;
  reserveWallet: string | null;
}) {
  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "updating treasury payout wallets",
    input.environment
  );

  const treasuryAccount = await ensureTreasuryAccount(
    input.merchantId,
    input.environment
  );
  const protocolAddress = getProtocolProgramAddress(input.environment);
  const operations: ReturnType<typeof toTreasuryOperationResponse>[] = [];

  const nextPrimaryWallet = normalizeAddress(input.primaryWallet);
  const nextReserveWallet = input.reserveWallet
    ? normalizeAddress(input.reserveWallet)
    : null;

  if (nextPrimaryWallet !== treasuryAccount.payoutWallet) {
    operations.push(
      await createWalletOperation({
        merchantId: input.merchantId,
        actor: input.actor,
        environment: input.environment,
        kind: "payout_wallet_change_request",
        targetAddress: protocolAddress,
        data: encodePayoutWalletChangeRequestCall(nextPrimaryWallet),
        metadata: {
          nextWallet: nextPrimaryWallet,
        },
      })
    );
  }

  if (nextReserveWallet === null && treasuryAccount.reserveWallet) {
    operations.push(
      await createWalletOperation({
        merchantId: input.merchantId,
        actor: input.actor,
        environment: input.environment,
        kind: "reserve_wallet_clear",
        targetAddress: protocolAddress,
        data: encodeReserveWalletClearCall(),
      })
    );
  } else if (
    nextReserveWallet !== null &&
    nextReserveWallet !== treasuryAccount.reserveWallet
  ) {
    operations.push(
      await createWalletOperation({
        merchantId: input.merchantId,
        actor: input.actor,
        environment: input.environment,
        kind: "reserve_wallet_update",
        targetAddress: protocolAddress,
        data: encodeReserveWalletUpdateCall(nextReserveWallet),
        metadata: {
          reserveWallet: nextReserveWallet,
        },
      })
    );
  }

  if (operations.length === 0) {
    throw new HttpError(409, "No treasury wallet changes are pending.");
  }

  return operations;
}

export async function createReservePromoteOperation(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
}) {
  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "promoting the reserve payout wallet",
    input.environment
  );

  const treasuryAccount = await ensureTreasuryAccount(
    input.merchantId,
    input.environment
  );

  if (!treasuryAccount.reserveWallet) {
    throw new HttpError(409, "Reserve wallet is not configured.");
  }

  return createWalletOperation({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.environment,
    kind: "reserve_wallet_promote",
    targetAddress: getProtocolProgramAddress(input.environment),
    data: encodeReserveWalletPromoteCall(),
  });
}

export async function createReserveClearOperation(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
}) {
  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "removing the reserve payout wallet",
    input.environment
  );

  const treasuryAccount = await ensureTreasuryAccount(
    input.merchantId,
    input.environment
  );

  if (!treasuryAccount.reserveWallet) {
    throw new HttpError(409, "Reserve wallet is not configured.");
  }

  return createWalletOperation({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.environment,
    kind: "reserve_wallet_clear",
    targetAddress: getProtocolProgramAddress(input.environment),
    data: encodeReserveWalletClearCall(),
  });
}

export async function createPayoutWalletConfirmOperation(input: {
  merchantId: string;
  actor: string;
  environment: RuntimeMode;
}) {
  await assertMerchantKybApprovedForLive(
    input.merchantId,
    "confirming the payout wallet change",
    input.environment
  );

  const treasuryAccount = await ensureTreasuryAccount(
    input.merchantId,
    input.environment
  );

  if (!treasuryAccount.pendingPayoutWallet || !treasuryAccount.payoutWalletChangeReadyAt) {
    throw new HttpError(409, "No payout wallet change is pending confirmation.");
  }

  if (treasuryAccount.payoutWalletChangeReadyAt > new Date()) {
    throw new HttpError(
      409,
      "Payout wallet change delay has not elapsed yet."
    );
  }

  return createWalletOperation({
    merchantId: input.merchantId,
    actor: input.actor,
    environment: input.environment,
    kind: "payout_wallet_change_confirm",
    targetAddress: getProtocolProgramAddress(input.environment),
    data: encodePayoutWalletChangeConfirmCall(),
    metadata: {
      nextWallet: treasuryAccount.pendingPayoutWallet,
    },
  });
}

export async function getTreasuryOperationSigningPayload(input: {
  merchantId: string;
  operationId: string;
  teamMemberId: string;
}) {
  const { operation, treasuryAccount } = await loadOperationWithTreasury(
    input.operationId,
    input.merchantId
  );

  requireTreasuryOperationStatus(operation.status);

  await ensureTreasurySignerMatchesGovernance({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    treasuryAccount,
  });

  const message = buildGovernanceApprovalMessage({
    merchantId: input.merchantId,
    operationId: operation._id.toString(),
    operationKind: operation.kind,
    governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
    governanceVaultAddress: treasuryAccount.governanceVaultAddress,
  });

  return {
    operation: toTreasuryOperationResponse(operation),
    signingPayload: {
      governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
      governanceVaultAddress: treasuryAccount.governanceVaultAddress,
      message,
    },
  };
}

export async function approveTreasuryOperation(input: {
  merchantId: string;
  operationId: string;
  teamMemberId: string;
  actor: string;
  signature: string;
}) {
  const { operation, treasuryAccount } = await loadOperationWithTreasury(
    input.operationId,
    input.merchantId
  );

  requireTreasuryOperationStatus(operation.status);

  const { member, signerBinding } = await ensureTreasurySignerMatchesGovernance({
    merchantId: input.merchantId,
    teamMemberId: input.teamMemberId,
    treasuryAccount,
  });

  const existingSignature = operation.signatures.find(
    (entry) => entry.teamMemberId === input.teamMemberId
  );

  if (existingSignature) {
    return toTreasuryOperationResponse(operation);
  }

  const message = buildGovernanceApprovalMessage({
    merchantId: input.merchantId,
    operationId: operation._id.toString(),
    operationKind: operation.kind,
    governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
    governanceVaultAddress: treasuryAccount.governanceVaultAddress,
  });

  if (
    !verifyDetachedSolanaMessage({
      message,
      signature: input.signature,
      walletAddress: signerBinding.walletAddress,
    })
  ) {
    throw new HttpError(401, "Treasury approval signature is invalid.");
  }

  operation.signatures.push({
    teamMemberId: input.teamMemberId,
    name: resolveTeamMemberActor(member),
    email: member.email,
    role: member.role,
    walletAddress: signerBinding.walletAddress,
    signature: input.signature,
    signedAt: new Date(),
  });
  operation.status =
    operation.signatures.length >= operation.threshold
      ? "approved"
      : "pending_signatures";
  await operation.save();
  await syncLinkedProtocolRecordState({
    operation,
    status: operation.status,
  });

  signerBinding.lastApprovedAt = new Date();
  await signerBinding.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Approved treasury operation",
    category: "treasury",
    status: "ok",
    target: operation.kind,
    detail: `${member.name} approved treasury operation ${operation.kind}.`,
    metadata: {
      operationId: operation._id.toString(),
      kind: operation.kind,
      approvedCount: operation.signatures.length,
      threshold: operation.threshold,
      governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
    },
    ipAddress: null,
    userAgent: null,
  });

  if (operation.status === "approved") {
    await queueTreasuryOperationStatusNotification({
      merchantId: input.merchantId,
      environment: toStoredRuntimeMode(operation.environment),
      operationId: operation._id.toString(),
      status: "approved",
    }).catch(() => undefined);
  }

  return toTreasuryOperationResponse(operation);
}

export async function rejectTreasuryOperation(input: {
  merchantId: string;
  operationId: string;
  actor: string;
  requesterTeamMemberId: string;
  payload: RejectTreasuryOperationInput;
}) {
  await ensureOwnerTeamMember({
    merchantId: input.merchantId,
    teamMemberId: input.requesterTeamMemberId,
  });

  const { operation, treasuryAccount } = await loadOperationWithTreasury(
    input.operationId,
    input.merchantId
  );

  requireTreasuryOperationStatus(operation.status);

  operation.status = "rejected";
  operation.rejectedBy = input.actor;
  operation.rejectionReason = input.payload.reason;
  operation.rejectedAt = new Date();
  await operation.save();
  await syncLinkedProtocolRecordState({
    operation,
    status: "rejected",
    txHash: null,
  });

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Rejected treasury operation",
    category: "treasury",
    status: "warning",
    target: operation.kind,
    detail: input.payload.reason,
    metadata: {
      operationId: operation._id.toString(),
      kind: operation.kind,
    },
    ipAddress: null,
    userAgent: null,
  });

  await queueTreasuryOperationStatusNotification({
    merchantId: input.merchantId,
    environment: toStoredRuntimeMode(treasuryAccount.environment),
    operationId: operation._id.toString(),
    status: "rejected",
    reason: input.payload.reason,
  }).catch(() => undefined);

  return toTreasuryOperationResponse(operation);
}

export async function executeTreasuryOperation(input: {
  merchantId: string;
  operationId: string;
  actor: string;
  requesterTeamMemberId: string;
}) {
  await ensureOwnerTeamMember({
    merchantId: input.merchantId,
    teamMemberId: input.requesterTeamMemberId,
  });

  const { operation, treasuryAccount } = await loadOperationWithTreasury(
    input.operationId,
    input.merchantId
  );

  if (operation.status !== "approved") {
    throw new HttpError(
      409,
      "Treasury operation does not yet have the required approvals."
    );
  }

  if (operation.signatures.length < operation.threshold) {
    throw new HttpError(
      409,
      "Treasury operation is missing governance confirmations."
    );
  }

  const metadata = (operation.metadata ?? {}) as Record<string, unknown>;
  const environment = toStoredRuntimeMode(treasuryAccount.environment);
  const governanceKinds = new Set([
    "governance_owner_add",
    "governance_owner_remove",
    "governance_threshold_change",
  ]);
  const merchantAuthorityTreasuryAccount = governanceKinds.has(operation.kind)
    ? treasuryAccount
    : await ensureProtocolOperatorVault(input.merchantId, environment);
  const operatorVault = governanceKinds.has(operation.kind)
    ? null
    : getOperatorVaultContext(merchantAuthorityTreasuryAccount);
  let executionTxHash: string | null = null;

  if (operation.kind === "governance_owner_add") {
    const ownerAddress = String(metadata.walletAddress ?? "").trim();

    if (!ownerAddress) {
      throw new HttpError(409, "Governance owner add operation is missing owner metadata.");
    }

    const result = await addSquadsGovernanceMember({
      environment,
      governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
      ownerAddress,
    });
    executionTxHash = result.txHash;
  } else if (operation.kind === "governance_owner_remove") {
    const ownerAddress = String(metadata.walletAddress ?? "").trim();

    if (!ownerAddress) {
      throw new HttpError(409, "Governance owner removal operation is missing owner metadata.");
    }

    const result = await removeSquadsGovernanceMember({
      environment,
      governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
      ownerAddress,
    });
    executionTxHash = result.txHash;
  } else if (operation.kind === "governance_threshold_change") {
    const nextThreshold = Number(metadata.nextThreshold);

    if (!Number.isInteger(nextThreshold) || nextThreshold < 1) {
      throw new HttpError(409, "Governance threshold change is missing a valid next threshold.");
    }

    const result = await changeSquadsGovernanceThreshold({
      environment,
      governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
      threshold: nextThreshold,
    });
    executionTxHash = result.txHash;
  } else if (operation.kind === "merchant_register") {
    const merchant = await getMerchantOrThrow(input.merchantId);
    const result = await createProtocolMerchant({
      environment,
      merchantId: input.merchantId,
      payoutWallet: merchantAuthorityTreasuryAccount.payoutWallet,
      metadataHash: merchant.metadataHash,
      ...operatorVault!,
    });
    executionTxHash = result.txHash;
  } else if (operation.kind === "plan_create") {
    const planId = String(metadata.planId ?? "").trim();
    const plan = await PlanModel.findById(planId).exec();

    if (!plan) {
      throw new HttpError(404, "Plan was not found.");
    }

    const result = await createProtocolPlan({
      environment,
      merchantId: input.merchantId,
      planCode: plan.planCode,
      usdAmount: plan.usdAmount,
      billingIntervalDays: plan.billingIntervalDays,
      trialDays: plan.trialDays,
      retryWindowHours: plan.retryWindowHours,
      maxRetryCount: Number(metadata.maxRetryCount ?? 0),
      billingMode: plan.billingMode,
      usageRate: plan.usageRate ?? null,
      ...operatorVault!,
    });
    executionTxHash = result.txHash;
  } else if (operation.kind === "plan_update") {
    const planId = String(metadata.planId ?? "").trim();
    const plan = await PlanModel.findById(planId).exec();

    if (!plan) {
      throw new HttpError(404, "Plan was not found.");
    }

    const targetStatus = String(metadata.targetStatus ?? plan.pendingStatus ?? plan.status).trim();
    const result = await updateProtocolPlan({
      environment,
      merchantId: input.merchantId,
      planCode: plan.planCode,
      usdAmount: plan.usdAmount,
      billingIntervalDays: plan.billingIntervalDays,
      trialDays: plan.trialDays,
      retryWindowHours: plan.retryWindowHours,
      maxRetryCount: Number(metadata.maxRetryCount ?? 0),
      billingMode: plan.billingMode,
      usageRate: plan.usageRate ?? null,
      active: targetStatus === "active",
      ...operatorVault!,
    });
    executionTxHash = result.txHash;
  } else if (operation.kind === "payout_wallet_change_request") {
    const nextWallet = String(metadata.nextWallet ?? "").trim();

    if (!nextWallet) {
      throw new HttpError(409, "Payout destination update is missing the next wallet.");
    }

    const result = await requestProtocolPayoutDestinationUpdate({
      environment,
      merchantId: input.merchantId,
      payoutWallet: nextWallet,
      ...operatorVault!,
    });
    executionTxHash = result.txHash;
  } else if (operation.kind === "payout_wallet_change_confirm") {
    const result = await confirmProtocolPayoutDestinationUpdate({
      environment,
      merchantId: input.merchantId,
      ...operatorVault!,
    });
    executionTxHash = result.txHash;
  } else if (
    operation.kind === "payout_batch_withdraw" ||
    operation.kind === "settlement_sweep"
  ) {
    const amountUsdc = Number(metadata.netUsdc);

    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      throw new HttpError(409, "Treasury withdrawal is missing a valid withdrawal amount.");
    }

    const result = await withdrawProtocolMerchantBalance({
      environment,
      merchantId: input.merchantId,
      amountUsdc,
      ...operatorVault!,
    });
    executionTxHash = result.txHash;
  } else if (
    operation.kind === "reserve_wallet_update" ||
    operation.kind === "reserve_wallet_clear" ||
    operation.kind === "reserve_wallet_promote"
  ) {
    executionTxHash = null;
  } else {
    throw new HttpError(
      501,
      `Direct Solana execution is not wired for treasury operation kind "${operation.kind}" yet.`
    );
  }

  operation.status = "executed";
  operation.txHash = executionTxHash;
  operation.executedAt = new Date();
  await operation.save();

  await applyExecutedOperationEffects({
    operation,
    treasuryAccount,
  });

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Executed treasury operation",
    category: "treasury",
    status: "ok",
    target: operation.kind,
    detail: `Treasury operation ${operation.kind} executed on-chain.`,
    metadata: {
      operationId: operation._id.toString(),
      governanceMultisigAddress: treasuryAccount.governanceMultisigAddress,
      txHash: executionTxHash,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toTreasuryOperationResponse(operation);
}

export async function listTreasuryOperationsByMerchantId(
  merchantId: string,
  environment?: RuntimeMode
) {
  const query: Record<string, unknown> = { merchantId };

  if (environment) {
    Object.assign(query, createRuntimeModeCondition("environment", environment));
  }

  const operations = await TreasuryOperationModel.find(query)
    .sort({ createdAt: -1 })
    .exec();

  return operations.map(toTreasuryOperationResponse);
}

export async function listSettlementSweepOperations(input: {
  merchantId: string;
  limit: number;
  environment?: RuntimeMode;
  status?: string;
}) {
  const query: Record<string, unknown> = {
    merchantId: input.merchantId,
    kind: "settlement_sweep",
  };

  if (input.environment) {
    Object.assign(query, createRuntimeModeCondition("environment", input.environment));
  }

  if (input.status) {
    query.status = input.status;
  }

  const operations = await TreasuryOperationModel.find(query)
    .sort({ createdAt: -1 })
    .limit(input.limit)
    .exec();

  return operations.map(toTreasuryOperationResponse);
}

export async function getSettlementSweepOperation(
  settlementId: string,
  merchantId: string,
  environment?: RuntimeMode
) {
  const operation = await TreasuryOperationModel.findOne({
    merchantId,
    settlementId,
    ...(environment
      ? createRuntimeModeCondition("environment", environment)
      : {}),
    kind: "settlement_sweep",
  }).exec();

  if (!operation) {
    throw new HttpError(404, "Settlement sweep operation was not found.");
  }

  return toTreasuryOperationResponse(operation);
}
