"use client";

import { fetchApi } from "@/lib/api";

export type OnboardingState = {
  merchantId: string;
  teamMemberId: string;
  environment: "test" | "live";
  status: string;
  canComplete: boolean;
  currentStepKey: string;
  steps: Array<{
    key: string;
    label: string;
    status: "complete" | "current" | "pending";
  }>;
  business: {
    logoUrl: string;
    name: string;
    supportEmail: string;
    supportedMarkets: string[];
  };
  verification: {
    ownerKyc: {
      status: string;
      metadata?: Record<string, unknown>;
      applicantId?: string | null;
      levelName?: string;
      reviewStatus?: string | null;
      reviewAnswer?: string | null;
    };
    merchantKyb: {
      status: string;
      metadata?: Record<string, unknown>;
      applicantId?: string | null;
      levelName?: string;
      reviewStatus?: string | null;
      reviewAnswer?: string | null;
    };
    required: {
      ownerKyc: boolean;
      merchantKyb: boolean;
    };
  };
  payout: {
    payoutWallet: string;
    payoutConfigured: boolean;
    bankTransferStatus: "coming_soon";
  };
};

export async function loadOnboardingState(input: {
  token: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<OnboardingState>("/onboarding", {
    token: input.token,
    query: {
      environment: input.environment,
    },
  });

  return response.data;
}

export async function saveOnboardingBusiness(input: {
  token: string;
  environment: "test" | "live";
  logoUrl?: string;
  name: string;
  supportEmail: string;
  supportedMarkets: string[];
}) {
  const response = await fetchApi<OnboardingState>("/onboarding/business", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
      logoUrl: input.logoUrl,
      name: input.name,
      supportEmail: input.supportEmail,
      supportedMarkets: input.supportedMarkets,
    }),
  });

  return response.data;
}

export async function startOnboardingVerification(input: {
  token: string;
  environment: "test" | "live";
  subject?: "owner_kyc" | "merchant_kyb";
  country?: string;
}) {
  const response = await fetchApi<{
    kyc: Record<string, unknown>;
    sdkAccessToken?: string;
    sdkAccessTokenExpiresAt?: string;
    userId?: string;
  }>("/onboarding/verification/start", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
      subject: input.subject,
      country: input.country,
    }),
  });

  return response.data;
}

export async function saveOnboardingPayout(input: {
  token: string;
  environment: "test" | "live";
  payoutWallet: string;
}) {
  const response = await fetchApi<OnboardingState>("/onboarding/payout", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
      payoutWallet: input.payoutWallet,
    }),
  });

  return response.data;
}

export async function registerOnboardingMerchant(input: {
  token: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<OnboardingState>("/onboarding/register", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
    }),
  });

  return response.data;
}
