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
import { loadInvoicesPage, type InvoiceRecord } from "@/lib/invoices";

export type PlaygroundWorkspaceUser = {
  merchantId: string;
  teamMemberId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  workspaceMode: "test" | "live";
  permissions: string[];
  markets: string[];
  onboardingStatus: string;
};

export type PlaygroundInvoiceRecord = InvoiceRecord;

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

export async function listPlaygroundInvoices(input: {
  environment: WorkspaceMode;
  merchantId: string;
  permissions?: readonly string[];
}) {
  const permissions = new Set(input.permissions ?? []);
  const canAccessInvoices =
    permissions.size === 0 ||
    permissions.has("invoices") ||
    permissions.has("team_admin");

  if (!canAccessInvoices) {
    return [] as readonly PlaygroundInvoiceRecord[];
  }

  const payload = await loadInvoicesPage({
    token: getRequiredPlaygroundToken(),
    merchantId: input.merchantId,
    environment: input.environment,
    status: "all",
    page: 1,
    limit: 100,
  });

  return payload.invoices.filter(
    (invoice) => invoice.status !== "draft" && invoice.status !== "void"
  );
}

export async function loadPlaygroundWorkspaceUser() {
  const payload = await fetchApi<PlaygroundWorkspaceUser>("/auth/me", {
    method: "GET",
    token: getRequiredPlaygroundToken(),
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
