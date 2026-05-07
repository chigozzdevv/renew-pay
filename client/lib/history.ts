"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export type HistoryType =
  | "payment"
  | "payout"
  | "customer"
  | "developer_event"
  | "workspace_event";

export type HistoryRecord = {
  id: string;
  type: HistoryType;
  title: string;
  status: string;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type HistoryPage = {
  items: HistoryRecord[];
  pagination: ApiPagination;
};

export async function loadHistoryPage(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  type?: HistoryType | "all";
  status?: string;
  search?: string;
  page: number;
  limit?: number;
}) {
  const limit = input.limit ?? 25;
  const response = await fetchApi<HistoryRecord[]>("/history", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      type: input.type && input.type !== "all" ? input.type : undefined,
      status: input.status?.trim() || undefined,
      search: input.search?.trim() || undefined,
      page: input.page,
      limit,
    },
  });

  return {
    items: response.data,
    pagination:
      response.pagination ??
      {
        page: input.page,
        limit,
        total: response.data.length,
        totalPages: Math.max(1, Math.ceil(response.data.length / limit)),
      },
  } satisfies HistoryPage;
}
