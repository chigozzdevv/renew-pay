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
};

export type VerificationSession = {
  kyc: VerificationStatus;
  verificationUrl?: string;
  sessionId?: string;
  sessionToken?: string | null;
  userId?: string;
};

const activeVerificationStatuses = new Set([
  "init",
  "started",
  "pending",
  "submitted",
  "in_review",
  "on_hold",
]);

export function shouldPollVerificationStatus(status: string) {
  return activeVerificationStatuses.has(status.trim().toLowerCase());
}

export async function loadVerificationSummary(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const owner = await fetchApi<VerificationStatus>("/kyc/owner", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
    },
  });

  return {
    ownerKyc: owner.data,
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

export async function syncOwnerVerification(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<VerificationStatus>("/kyc/owner/sync", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
    }),
  });

  return response.data;
}
