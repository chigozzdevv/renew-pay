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
  businessProfile: {
    businessName: string;
    supportEmail: string;
    billingTimezone: string;
    supportedMarkets: string[];
    defaultMarket: string;
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
    payoutMode: string;
    autoPayoutFrequency: string | null;
    autoPayoutTimeLocal: string;
    thresholdPayoutEnabled: boolean;
    autoPayoutThresholdUsdc: number | null;
  };
  governance: {
    enabled: boolean;
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

export async function saveOnboardingBusinessProfile(input: {
  token: string;
  environment: "test" | "live";
  businessName: string;
  supportEmail: string;
  billingTimezone: string;
  supportedMarkets: string[];
  defaultMarket?: string;
}) {
  const response = await fetchApi<OnboardingState>("/onboarding/business-profile", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
      businessName: input.businessName,
      supportEmail: input.supportEmail,
      billingTimezone: input.billingTimezone,
      supportedMarkets: input.supportedMarkets,
      defaultMarket: input.defaultMarket,
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

export async function saveOnboardingPayoutWallet(input: {
  token: string;
  environment: "test" | "live";
  payoutWallet: string;
}) {
  const response = await fetchApi<OnboardingState>("/onboarding/payout-settings", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
      payoutWallet: input.payoutWallet,
    }),
  });

  return response.data;
}

export async function saveOnboardingGovernance(input: {
  token: string;
  environment: "test" | "live";
  enabled: boolean;
}) {
  const response = await fetchApi<OnboardingState>("/onboarding/governance", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
      enabled: input.enabled,
    }),
  });

  return response.data;
}

export async function completeWorkspaceOnboarding(input: {
  token: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<OnboardingState>("/onboarding/complete", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
    }),
  });

  return response.data;
}
