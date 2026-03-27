"use client";
import {
  createRenewCheckoutClient,
  type RenewCheckoutClient,
  type CreateCheckoutSessionResult,
  type RenewCheckoutPlan,
  type RenewCheckoutSession,
  type SubmitCheckoutCustomerInput,
} from "@renew.sh/sdk/core";

import { ApiError, fetchApi, getApiOrigin, readAccessToken, type WorkspaceMode } from "@/lib/api";

export function createPlaygroundCheckoutClient() {
  return createRenewCheckoutClient({
    apiOrigin: getApiOrigin(),
  });
}

function getRequiredPlaygroundToken() {
  const token = readAccessToken();

  if (!token) {
    throw new ApiError(401, "Sign in to your workspace to use Playground.");
  }

  return token;
}

export async function listPlaygroundPlans(environment: WorkspaceMode) {
  const payload = await fetchApi<readonly RenewCheckoutPlan[]>("/checkout/playground/plans", {
    method: "GET",
    token: getRequiredPlaygroundToken(),
    query: {
      environment,
    },
  });

  return payload.data;
}

export async function createPlaygroundSession(planId: string, environment: WorkspaceMode) {
  const payload = await fetchApi<CreateCheckoutSessionResult>("/checkout/playground/sessions", {
    method: "POST",
    token: getRequiredPlaygroundToken(),
    body: JSON.stringify({
      planId,
      expiresInMinutes: 20,
      environment,
      metadata: {
        source: "playground",
      },
    }),
  });

  return payload.data;
}

export async function getPlaygroundSession(sessionId: string, clientSecret: string) {
  return createPlaygroundCheckoutClient().getSession(sessionId, { clientSecret });
}

export async function submitPlaygroundCustomer(
  sessionId: string,
  clientSecret: string,
  input: SubmitCheckoutCustomerInput
) {
  return createPlaygroundCheckoutClient().submitCustomer(sessionId, input, {
    clientSecret,
  });
}

export async function completePlaygroundTestPayment(
  sessionId: string,
  clientSecret: string
) {
  return createPlaygroundCheckoutClient().completeTestPayment(sessionId, {
    clientSecret,
  });
}

export type PlaygroundSessionState = RenewCheckoutSession;
export type PlaygroundCheckoutClient = RenewCheckoutClient;
