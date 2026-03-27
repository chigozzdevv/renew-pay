"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export type CustomerRecord = {
  id: string;
  merchantId: string;
  customerRef: string;
  name: string;
  email: string;
  market: string;
  status: "active" | "paused" | "at_risk" | "blacklisted";
  billingState: "healthy" | "at_risk" | "past_due" | "paused";
  paymentMethodState: "ok" | "update_needed" | "expired" | "missing";
  subscriptionCount: number;
  monthlyVolumeUsdc: number;
  nextRenewalAt: string | null;
  lastChargeAt: string | null;
  autoReminderEnabled: boolean;
  blacklistedAt: string | null;
  blacklistReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CustomerPage = {
  customers: CustomerRecord[];
  pagination: ApiPagination;
};

function resolvePagination(
  pagination: ApiPagination | undefined,
  page: number,
  limit: number,
  count: number
) {
  return (
    pagination ?? {
      page,
      limit,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    }
  );
}

export async function loadCustomers(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: CustomerRecord["status"] | "all";
  market?: string;
  search?: string;
}) {
  const response = await fetchApi<CustomerRecord[]>("/customers", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      status: input.status && input.status !== "all" ? input.status : undefined,
      market: input.market?.trim() ? input.market.trim().toUpperCase() : undefined,
      search: input.search?.trim() || undefined,
    },
  });

  return response.data;
}

export async function loadCustomersPage(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: CustomerRecord["status"] | "all";
  market?: string;
  search?: string;
  page: number;
  limit?: number;
}) {
  const limit = input.limit ?? 20;
  const response = await fetchApi<CustomerRecord[]>("/customers", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      status: input.status && input.status !== "all" ? input.status : undefined,
      market: input.market?.trim() ? input.market.trim().toUpperCase() : undefined,
      search: input.search?.trim() || undefined,
      page: input.page,
      limit,
    },
  });

  return {
    customers: response.data,
    pagination: resolvePagination(response.pagination, input.page, limit, response.data.length),
  } satisfies CustomerPage;
}

export async function createCustomer(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  customerRef: string;
  name: string;
  email: string;
  market: string;
}) {
  const response = await fetchApi<CustomerRecord>("/customers", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
      customerRef: input.customerRef,
      name: input.name,
      email: input.email,
      market: input.market,
    }),
  });

  return response.data;
}

export async function pauseCustomer(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  customerId: string;
}) {
  const response = await fetchApi<CustomerRecord>(`/customers/${input.customerId}/pause`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
    }),
  });

  return response.data;
}

export async function resumeCustomer(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  customerId: string;
}) {
  const response = await fetchApi<CustomerRecord>(`/customers/${input.customerId}/resume`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
    }),
  });

  return response.data;
}

export async function blacklistCustomer(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  customerId: string;
  reason: string;
}) {
  const response = await fetchApi<CustomerRecord>(`/customers/${input.customerId}/blacklist`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
      reason: input.reason,
    }),
  });

  return response.data;
}
