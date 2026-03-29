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
  const body: Record<string, unknown> = {
    authToken: input.authToken,
  };

  if (input.identityToken) {
    body.identityToken = input.identityToken;
  }

  if (input.email) {
    body.email = input.email;
  }

  if (input.billingTimezone) {
    body.billingTimezone = input.billingTimezone;
  }

  if (input.supportedMarkets?.length) {
    body.supportedMarkets = input.supportedMarkets;
  }

  if (input.operatorWalletAddress) {
    body.operatorWalletAddress = input.operatorWalletAddress;
  }

  const response = await fetchApi<PrivySessionResponse>("/auth/privy/session", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return response.data;
}
