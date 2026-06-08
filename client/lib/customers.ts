"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export type CustomerRecord = {
  id: string;
  merchantId: string;
  customerRef: string;
  name: string;
  email: string;
  market: string;
  status: "active" | "inactive" | "blacklisted";
  monthlyVolumeUsdc: number;
  blacklistedAt: string | null;
  blacklistReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CustomerSummary = {
  total: number;
  active: number;
  blocked: number;
  markets: number;
};

export type CustomerPage = {
  customers: CustomerRecord[];
  pagination: ApiPagination;
  summary: CustomerSummary;
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

function resolveCustomerSummary(
  summary: CustomerSummary | undefined,
  customers: CustomerRecord[],
  pagination: ApiPagination
) {
  if (summary) {
    return summary;
  }

  return {
    total: pagination.total,
    active: customers.filter((customer) => customer.status === "active").length,
    blocked: customers.filter((customer) => customer.status === "blacklisted").length,
    markets: new Set(customers.map((customer) => customer.market)).size,
  };
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
  const response = await fetchApi<CustomerRecord[], CustomerSummary>("/customers", {
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
  const pagination = resolvePagination(
    response.pagination,
    input.page,
    limit,
    response.data.length
  );

  return {
    customers: response.data,
    pagination,
    summary: resolveCustomerSummary(response.summary, response.data, pagination),
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

export async function updateCustomer(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  customerId: string;
  name: string;
  email: string;
  market: string;
}) {
  const response = await fetchApi<CustomerRecord>(`/customers/${input.customerId}`, {
    method: "PATCH",
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
    },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      market: input.market,
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
