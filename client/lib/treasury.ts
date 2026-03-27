"use client";

import { fetchApi } from "@/lib/api";

export type TreasuryAccount = {
  id: string;
  merchantId: string;
  custodyModel: string;
  governanceMultisigAddress: string;
  governanceVaultAddress: string;
  payoutWallet: string;
  reserveWallet: string | null;
  ownerAddresses: string[];
  threshold: number;
  governanceVaultIndex: number;
  network: string;
  gasPolicy: string;
  status: string;
  pendingPayoutWallet: string | null;
  payoutWalletChangeReadyAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TreasurySigner = {
  id: string;
  merchantId: string;
  teamMemberId: string;
  walletAddress: string;
  status: string;
  challengeMessage: string | null;
  challengeIssuedAt: string | null;
  verifiedAt: string | null;
  revokedAt: string | null;
  lastApprovedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TreasuryOperationSignature = {
  teamMemberId: string;
  name: string;
  email: string;
  role: string;
  walletAddress: string;
  signedAt: string;
};

export type TreasuryOperation = {
  id: string;
  merchantId: string;
  treasuryAccountId: string;
  settlementId: string | null;
  kind: string;
  status: string;
  governanceMultisigAddress: string;
  governanceVaultAddress: string;
  threshold: number;
  approvedCount: number;
  canExecute: boolean;
  targetAddress: string;
  value: string;
  data: string;
  origin: string;
  createdBy: string;
  signatures: TreasuryOperationSignature[];
  txHash: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  executedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type TreasuryOverview = {
  account: TreasuryAccount | null;
  signers: TreasurySigner[];
  operations: TreasuryOperation[];
};

export type TeamMember = {
  id: string;
  merchantId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  markets: string[];
  permissions: string[];
  access: string;
  lastActiveAt: string | null;
  inviteSentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayoutBatch = {
  id: string;
  merchantId: string;
  environment: "test" | "live";
  destinationWallet: string;
  status: string;
  trigger: string;
  settlementIds: string[];
  settlementCount: number;
  grossUsdc: number;
  feeUsdc: number;
  netUsdc: number;
  txHash: string | null;
  openedAt: string | null;
  executedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TreasuryPayoutOverview = {
  merchantId: string;
  environment: "test" | "live";
  payoutWallet: string;
  payoutMode: string;
  autoPayoutFrequency: string | null;
  autoPayoutTimeLocal: string;
  thresholdPayoutEnabled: boolean;
  autoPayoutThresholdUsdc: number | null;
  availableBalanceUsdc: number;
  pendingSettlementUsdc: number;
  batches: PayoutBatch[];
};

export type PayoutBatchPreview = {
  payoutWallet: string;
  payoutMode: string;
  preview: PayoutBatch | null;
  availableSettlementIds: string[];
};

export type TreasurySigningPayload = {
  operation: TreasuryOperation;
  signingPayload: {
    governanceMultisigAddress: string;
    governanceVaultAddress: string;
    message: string;
  };
};

export async function loadPayoutWorkspace(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<TreasuryPayoutOverview>(
    `/treasury/${input.merchantId}/payout-batches`,
    {
      token: input.token,
      query: {
        environment: input.environment,
      },
    }
  );

  return response.data;
}

export async function previewPayoutBatch(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  trigger?: "manual" | "scheduled" | "threshold";
}) {
  const response = await fetchApi<PayoutBatchPreview>(
    `/treasury/${input.merchantId}/payout-batches/preview`,
    {
      method: "POST",
      token: input.token,
      body: JSON.stringify({
        environment: input.environment,
        trigger: input.trigger ?? "manual",
      }),
    }
  );

  return response.data;
}

export async function updatePayoutSettings(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  payoutMode: "manual" | "automatic";
  autoPayoutFrequency: "daily" | "weekly" | "monthly" | null;
  autoPayoutTimeLocal: string;
  thresholdPayoutEnabled: boolean;
  autoPayoutThresholdUsdc: number | null;
}) {
  const response = await fetchApi<TreasuryPayoutOverview>(
    `/treasury/${input.merchantId}/payout-settings`,
    {
      method: "PATCH",
      token: input.token,
      body: JSON.stringify({
        environment: input.environment,
        payoutMode: input.payoutMode,
        autoPayoutFrequency: input.autoPayoutFrequency,
        autoPayoutTimeLocal: input.autoPayoutTimeLocal,
        thresholdPayoutEnabled: input.thresholdPayoutEnabled,
        autoPayoutThresholdUsdc: input.autoPayoutThresholdUsdc,
      }),
    }
  );

  return response.data;
}

export async function withdrawTreasuryBalance(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  trigger?: "manual" | "scheduled" | "threshold";
}) {
  const response = await fetchApi<{
    batch: PayoutBatch;
    treasury: TreasuryPayoutOverview;
  }>(`/treasury/${input.merchantId}/withdraw`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
      trigger: input.trigger ?? "manual",
    }),
  });

  return response.data;
}

export async function createTreasurySignerChallenge(input: {
  token: string;
  merchantId: string;
  walletAddress: string;
}) {
  const response = await fetchApi<{
    signer: TreasurySigner;
    challengeMessage: string;
  }>(`/treasury/${input.merchantId}/signers/challenge`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      walletAddress: input.walletAddress,
    }),
  });

  return response.data;
}

export async function verifyTreasurySigner(input: {
  token: string;
  merchantId: string;
  signature: string;
}) {
  const response = await fetchApi<TreasurySigner>(
    `/treasury/${input.merchantId}/signers/verify`,
    {
      method: "POST",
      token: input.token,
      body: JSON.stringify({
        signature: input.signature,
      }),
    }
  );

  return response.data;
}

export async function bootstrapTreasuryAccount(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  payload:
    | {
        mode: "create";
        ownerTeamMemberIds: string[];
        threshold?: number;
      }
    | {
        mode: "import";
        governanceMultisigAddress: string;
      };
}) {
  const response = await fetchApi<TreasuryAccount>(
    `/treasury/${input.merchantId}/bootstrap`,
    {
      method: "POST",
      token: input.token,
      body: JSON.stringify({
        ...input.payload,
        environment: input.environment,
      }),
    }
  );

  return response.data;
}

export async function addTreasuryOwner(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  teamMemberId: string;
  threshold?: number;
}) {
  const response = await fetchApi<TreasuryOperation>(
    `/treasury/${input.merchantId}/owners`,
    {
      method: "POST",
      token: input.token,
      body: JSON.stringify({
        environment: input.environment,
        teamMemberId: input.teamMemberId,
        threshold: input.threshold,
      }),
    }
  );

  return response.data;
}

export async function removeTreasuryOwner(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  teamMemberId: string;
  threshold?: number;
}) {
  const response = await fetchApi<TreasuryOperation>(
    `/treasury/${input.merchantId}/owners/${input.teamMemberId}/remove`,
    {
      method: "POST",
      token: input.token,
      body: JSON.stringify({
        environment: input.environment,
        threshold: input.threshold,
      }),
    }
  );

  return response.data;
}

export async function updateTreasuryThreshold(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  threshold: number;
}) {
  const response = await fetchApi<TreasuryOperation>(
    `/treasury/${input.merchantId}/threshold`,
    {
      method: "POST",
      token: input.token,
      body: JSON.stringify({
        environment: input.environment,
        threshold: input.threshold,
      }),
    }
  );

  return response.data;
}

export async function getTreasuryOperationSigningPayload(input: {
  token: string;
  operationId: string;
}) {
  const response = await fetchApi<TreasurySigningPayload>(
    `/treasury/operations/${input.operationId}/signing-payload`,
    {
      token: input.token,
    }
  );

  return response.data;
}

export async function approveTreasuryOperation(input: {
  token: string;
  operationId: string;
  signature: string;
}) {
  const response = await fetchApi<TreasuryOperation>(
    `/treasury/operations/${input.operationId}/approve`,
    {
      method: "POST",
      token: input.token,
      body: JSON.stringify({
        signature: input.signature,
      }),
    }
  );

  return response.data;
}

export async function rejectTreasuryOperation(input: {
  token: string;
  operationId: string;
  reason: string;
}) {
  const response = await fetchApi<TreasuryOperation>(
    `/treasury/operations/${input.operationId}/reject`,
    {
      method: "POST",
      token: input.token,
      body: JSON.stringify({
        reason: input.reason,
      }),
    }
  );

  return response.data;
}

export async function executeTreasuryOperation(input: {
  token: string;
  operationId: string;
}) {
  const response = await fetchApi<TreasuryOperation>(
    `/treasury/operations/${input.operationId}/execute`,
    {
      method: "POST",
      token: input.token,
    }
  );

  return response.data;
}
