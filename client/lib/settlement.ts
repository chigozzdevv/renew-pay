"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export type SettlementAccountRecord = {
  id: string;
  merchantId: string;
  environment: "test" | "live";
  accountCode: string;
  name: string;
  assetSymbol: "USDC";
  destinationAddress: string | null;
  isDefault: boolean;
  status: "active" | "disabled";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SettlementAccountPage = {
  accounts: SettlementAccountRecord[];
  pagination: ApiPagination;
};

export type SettlementAssetOption = {
  network: "stellar";
  symbol: "USDC";
  label: string;
  decimals: number;
};

export type SettlementAssetCatalog = {
  environment: "test" | "live";
  assets: SettlementAssetOption[];
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

function toSettlementAccount(record: SettlementAccountRecord): SettlementAccountRecord {
  return {
    ...record,
    accountCode: record.accountCode ?? record.id,
  };
}

export async function loadSettlementAccounts(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: SettlementAccountRecord["status"] | "all";
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = input.page ?? 1;
  const limit = input.limit ?? 50;
  const response = await fetchApi<SettlementAccountRecord[]>("/settlement/accounts", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      status: input.status && input.status !== "all" ? input.status : undefined,
      search: input.search?.trim() || undefined,
      page,
      limit,
    },
  });

  return {
    accounts: response.data.map(toSettlementAccount),
    pagination: resolvePagination(response.pagination, page, limit, response.data.length),
  } satisfies SettlementAccountPage;
}

export async function loadSettlementAssets(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<SettlementAssetCatalog>("/settlement/assets", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
    },
  });

  return response.data;
}

export async function createSettlementAccount(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  name: string;
  destinationAddress: string;
  isDefault?: boolean;
}) {
  const response = await fetchApi<SettlementAccountRecord>("/settlement/accounts", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
      name: input.name,
      assetSymbol: "USDC",
      destinationAddress: input.destinationAddress,
      isDefault: input.isDefault ?? false,
      status: "active",
    }),
  });

  return toSettlementAccount(response.data);
}
