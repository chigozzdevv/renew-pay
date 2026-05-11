"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export type SettlementRouteRecord = {
  id: string;
  merchantId: string;
  environment: "test" | "live";
  routeCode: string;
  name: string;
  mode: "standard" | "private";
  provider: "direct" | "umbra";
  chain: "solana" | "avalanche";
  assetSymbol: string;
  assetMint: string | null;
  assetDecimals: number;
  destinationAddress: string | null;
  feeBps: number;
  isDefault: boolean;
  status: "active" | "disabled";
  privacy: {
    provider: string | null;
    strategy: string | null;
    poolMint: string | null;
    viewingKeyPolicy: string | null;
  } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SettlementRoutePage = {
  routes: SettlementRouteRecord[];
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

export async function loadSettlementRoutes(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  provider?: SettlementRouteRecord["provider"] | "all";
  mode?: SettlementRouteRecord["mode"] | "all";
  status?: SettlementRouteRecord["status"] | "all";
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = input.page ?? 1;
  const limit = input.limit ?? 50;
  const response = await fetchApi<SettlementRouteRecord[]>("/settlement/routes", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      provider: input.provider && input.provider !== "all" ? input.provider : undefined,
      mode: input.mode && input.mode !== "all" ? input.mode : undefined,
      status: input.status && input.status !== "all" ? input.status : undefined,
      search: input.search?.trim() || undefined,
      page,
      limit,
    },
  });

  return {
    routes: response.data,
    pagination: resolvePagination(response.pagination, page, limit, response.data.length),
  } satisfies SettlementRoutePage;
}

export async function createSettlementRoute(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  name: string;
  settlementType: "standard" | "private";
  assetSymbol: string;
  destinationAddress: string;
  isDefault?: boolean;
}) {
  const response = await fetchApi<SettlementRouteRecord>("/settlement/routes", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
      name: input.name,
      mode: input.settlementType,
      provider: input.settlementType === "private" ? "umbra" : "direct",
      chain: "solana",
      assetSymbol: input.assetSymbol,
      destinationAddress: input.destinationAddress,
      isDefault: input.isDefault ?? false,
      status: "active",
    }),
  });

  return response.data;
}
