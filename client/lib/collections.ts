"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export type CollectionRecord = {
  id: string;
  paymentId: string;
  reference: string;
  amount: number;
  currency: string;
  description: string;
  items: Array<{
    name: string;
    quantity: number;
    amount: number;
  }>;
  status: "created" | "collecting" | "paid" | "failed" | "cancelled";
  checkoutUrl: string;
  recurring: {
    enabled: boolean;
    interval: "day" | "week" | "month" | "year" | null;
    intervalCount: number | null;
    startsAt: string | null;
    endsAt: string | null;
  };
  settlement: { id: string } | null;
  customer: {
    reference: string | null;
    email: string | null;
    name: string | null;
  } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CollectionPage = {
  collections: CollectionRecord[];
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

export async function loadCollectionPage(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: CollectionRecord["status"] | "all";
  recurring?: boolean | "all";
  search?: string;
  page: number;
  limit?: number;
}) {
  const limit = input.limit ?? 20;
  const response = await fetchApi<CollectionRecord[]>("/collections", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      status: input.status && input.status !== "all" ? input.status : undefined,
      recurring: input.recurring === "all" ? undefined : input.recurring,
      search: input.search?.trim() || undefined,
      page: input.page,
      limit,
    },
  });

  return {
    collections: response.data,
    pagination: resolvePagination(response.pagination, input.page, limit, response.data.length),
  } satisfies CollectionPage;
}

export async function createCollection(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  reference: string;
  settlement?: string | null;
  amount: number;
  currency: string;
  description?: string;
  items?: Array<{
    name: string;
    quantity?: number;
    amount: number;
  }>;
  recurring: {
    enabled: boolean;
    interval?: "day" | "week" | "month" | "year" | null;
    intervalCount?: number | null;
    startsAt?: string | null;
    endsAt?: string | null;
  };
}) {
  const response = await fetchApi<CollectionRecord>("/collections", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
      reference: input.reference,
      settlement: input.settlement || undefined,
      amount: input.amount,
      currency: input.currency,
      description: input.description?.trim() || undefined,
      items: input.items,
      recurring: input.recurring,
    }),
  });

  return response.data;
}
