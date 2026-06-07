"use client";

import { fetchApi } from "@/lib/api";

export type VerificationStatus = {
  status: string;
  metadata?: Record<string, unknown>;
  applicantId?: string | null;
  levelName?: string;
  reviewStatus?: string | null;
  reviewAnswer?: string | null;
};

export type VerificationSummary = {
  ownerKyc: VerificationStatus;
  merchantKyb: VerificationStatus;
};

export type VerificationSession = {
  kyc: VerificationStatus;
  verificationUrl?: string;
  sessionId?: string;
  sessionToken?: string | null;
  userId?: string;
};

export async function loadVerificationSummary(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const [owner, merchant] = await Promise.all([
    fetchApi<VerificationStatus>("/kyc/owner", {
      token: input.token,
      query: {
        merchantId: input.merchantId,
        environment: input.environment,
      },
    }),
    fetchApi<VerificationStatus>(`/kyc/merchants/${input.merchantId}`, {
      token: input.token,
      query: {
        environment: input.environment,
      },
    }),
  ]);

  return {
    ownerKyc: owner.data,
    merchantKyb: merchant.data,
  };
}

export async function startOwnerVerification(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<VerificationSession>("/kyc/owner/start-kyc", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
    }),
  });

  return response.data;
}

export async function startBusinessVerification(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<VerificationSession>(
    `/kyc/merchants/${input.merchantId}/start-kyb`,
    {
      method: "POST",
      token: input.token,
      body: JSON.stringify({
        environment: input.environment,
      }),
    }
  );

  return response.data;
}
