"use client";

import { fetchApi } from "@/lib/api";

export type PayoutRecord = {
  id: string;
  merchantId: string;
  sourcePaymentId: string | null;
  batchRef: string;
  sourceKind: string;
  commercialRef: string | null;
  localAmount: number | null;
  fxRate: number | null;
  grossUsdc: number;
  feeUsdc: number;
  netUsdc: number;
  destinationWallet: string;
  status: "queued" | "confirming" | "held" | "settled" | "failed" | "reversed";
  txHash: string | null;
  bridgeSourceTxHash: string | null;
  bridgeReceiveTxHash: string | null;
  creditTxHash: string | null;
  vaultBatchId: string | null;
  vaultDepositTxHash: string | null;
  vaultReleaseTxHash: string | null;
  vaultHeldAt: string | null;
  submittedAt: string | null;
  bridgeAttestedAt: string | null;
  scheduledFor: string;
  settledAt: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function loadPayouts(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: PayoutRecord["status"] | "all";
  search?: string;
}) {
  const response = await fetchApi<PayoutRecord[]>("/payouts", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      status: input.status && input.status !== "all" ? input.status : undefined,
      search: input.search?.trim() || undefined,
    },
  });

  return response.data;
}

export async function processPayout(input: {
  token: string;
  payoutId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<{
    queued: boolean;
    processedInline?: boolean;
    payoutId: string;
    result?: unknown;
  }>(`/payouts/${input.payoutId}/process`, {
    method: "POST",
    token: input.token,
    query: {
      environment: input.environment,
    },
  });

  return response.data;
}
