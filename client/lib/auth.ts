"use client";

import { fetchApi } from "@/lib/api";

export type PrivySessionResponse = {
  accessToken: string;
  expiresInSeconds: number;
  user: {
    merchantId: string;
    teamMemberId: string;
    name: string;
    email: string;
    onboardingStatus: string;
    governanceEnabled: boolean;
  };
};

export async function exchangePrivySession(input: {
  authToken: string;
  identityToken?: string | null;
  email?: string;
  billingTimezone?: string;
  supportedMarkets?: string[];
  operatorWalletAddress?: string | null;
}) {
  const response = await fetchApi<PrivySessionResponse>("/auth/privy/session", {
    method: "POST",
    body: JSON.stringify({
      authToken: input.authToken,
      identityToken: input.identityToken ?? undefined,
      email: input.email,
      billingTimezone:
        input.billingTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      supportedMarkets: input.supportedMarkets ?? ["NGN"],
      operatorWalletAddress: input.operatorWalletAddress ?? undefined,
    }),
  });

  return response.data;
}
