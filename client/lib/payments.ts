"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export type PaymentRecord = {
  id: string;
  merchantId: string;
  environment: "test" | "live";
  payId: string;
  customerId: string | null;
  settlementAccountId: string | null;
  amount: number;
  currency: string;
  description: string;
  status: "open" | "pending" | "paid" | "settling" | "settled" | "failed" | "cancelled";
  paymentUrl: string;
  recurring: {
    enabled: boolean;
    interval: "day" | "week" | "month" | "year" | null;
    intervalCount: number | null;
    startsAt: string | null;
    endsAt: string | null;
  };
  collection: {
    provider: "partna";
    status: string;
    externalId: string | null;
    localAmount: number | null;
    fxRate: number | null;
    stableAmount: number | null;
    feeAmount: number | null;
    paidAt: string | null;
  };
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PaymentPage = {
  payments: PaymentRecord[];
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

export async function loadPaymentPage(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: PaymentRecord["status"] | "all";
  recurring?: boolean | "all";
  search?: string;
  page: number;
  limit?: number;
}) {
  const limit = input.limit ?? 20;
  const response = await fetchApi<PaymentRecord[]>("/payments", {
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
    payments: response.data,
    pagination: resolvePagination(response.pagination, input.page, limit, response.data.length),
  } satisfies PaymentPage;
}

export async function createPayment(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  customerId?: string | null;
  settlementAccountId?: string | null;
  amount: number;
  currency: string;
  description: string;
  recurring: {
    enabled: boolean;
    interval?: "day" | "week" | "month" | "year" | null;
    intervalCount?: number | null;
    startsAt?: string | null;
    endsAt?: string | null;
  };
}) {
  const response = await fetchApi<PaymentRecord>("/payments", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
      customerId: input.customerId ?? null,
      settlementAccountId: input.settlementAccountId ?? null,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      recurring: input.recurring,
    }),
  });

  return response.data;
}
