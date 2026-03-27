"use client";

import { fetchApi } from "@/lib/api";

export type GovernanceState = {
  merchantId: string;
  enabled: boolean;
  onboardingStatus: string;
  mode: "single_owner" | "multisig";
  controllerWalletAddress: string | null;
  payoutWallet: string;
  activeSignerCount: number;
  threshold: number;
  approvers: Array<{
    id: string;
    teamMemberId: string;
    walletAddress: string;
    status: string;
    verifiedAt: string | null;
    revokedAt: string | null;
    role: string;
    name: string;
    email: string | null;
  }>;
};

export async function loadGovernanceState(input: {
  token: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<GovernanceState>("/governance", {
    token: input.token,
    query: {
      environment: input.environment,
    },
  });

  return response.data;
}

export async function setGovernanceEnabled(input: {
  token: string;
  environment: "test" | "live";
  enabled: boolean;
}) {
  const response = await fetchApi<GovernanceState>("/governance/enable", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
      enabled: input.enabled,
    }),
  });

  return response.data;
}
