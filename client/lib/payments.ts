"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export type PaymentRecord = {
  id: string;
  merchantId: string;
  sourceKind: "subscription" | "invoice";
  subscriptionId: string | null;
  invoiceId: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  externalChargeId: string;
  settlementSource: string | null;
  localAmount: number;
  fxRate: number;
  usdcAmount: number;
  feeAmount: number;
  status: "pending" | "awaiting_settlement" | "confirming" | "settled" | "failed" | "reversed";
  failureCode: string | null;
  processedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentWorkspace = {
  payments: PaymentRecord[];
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

export async function loadPaymentWorkspace(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: PaymentRecord["status"] | "all";
  sourceKind?: PaymentRecord["sourceKind"] | "all";
  search?: string;
}) {
  const chargesResponse = await fetchApi<PaymentRecord[]>("/charges", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      status: input.status && input.status !== "all" ? input.status : undefined,
      sourceKind:
        input.sourceKind && input.sourceKind !== "all" ? input.sourceKind : undefined,
      search: input.search?.trim() || undefined,
    },
  });

  return {
    payments: chargesResponse.data,
  } satisfies PaymentWorkspace;
}

export async function loadPaymentPage(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: PaymentRecord["status"] | "all";
  sourceKind?: PaymentRecord["sourceKind"] | "all";
  search?: string;
  page: number;
  limit?: number;
}) {
  const limit = input.limit ?? 20;
  const chargesResponse = await fetchApi<PaymentRecord[]>("/charges", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      status: input.status && input.status !== "all" ? input.status : undefined,
      sourceKind:
        input.sourceKind && input.sourceKind !== "all" ? input.sourceKind : undefined,
      search: input.search?.trim() || undefined,
      page: input.page,
      limit,
    },
  });

  return {
    payments: chargesResponse.data,
    pagination: resolvePagination(
      chargesResponse.pagination,
      input.page,
      limit,
      chargesResponse.data.length
    ),
  } satisfies PaymentPage;
}

export async function retryCharge(input: {
  token: string;
  chargeId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<{
    queued: boolean;
    processedInline?: boolean;
    chargeId: string;
  }>(`/charges/${input.chargeId}/retry`, {
    method: "POST",
    token: input.token,
    query: {
      environment: input.environment,
    },
  });

  return response.data;
}
