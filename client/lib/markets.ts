"use client";

import { fetchApi } from "@/lib/api";

export type BillingMarketCatalogEntry = {
  currency: string;
  currencyName: string;
  symbol: string;
  countryCodes: string[];
  countries: string[];
  channelTypes: string[];
  min: number | null;
  max: number | null;
  estimatedSettlementTime: number | null;
};

export type BillingMarketCatalog = {
  merchantSupportedMarkets: string[];
  defaultMarket: string | null;
  markets: BillingMarketCatalogEntry[];
};

export type BillingMarketQuote = {
  currency: string;
  localAmount: number;
  usdcAmount: number;
  fxRate: number;
  feeAmount: number;
  expiresAt: string | null;
  settlementAsset: "USDC";
  settlementNetwork: "SOLANA";
  channel: {
    externalId: string;
    country: string;
    channelType: string;
    estimatedSettlementTime: number;
    min: number;
    max: number;
  };
  network: {
    externalId: string;
    name: string;
    country: string;
    accountNumberType: string | null;
  } | null;
};

export async function loadBillingMarketCatalog(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<BillingMarketCatalog>("/dashboard/market-catalog", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
    },
  });

  return response.data;
}

export async function loadPlanMarketQuote(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  planId: string;
  currency: string;
}) {
  const response = await fetchApi<BillingMarketQuote>("/dashboard/market-quote", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      planId: input.planId,
      currency: input.currency,
    },
  });

  return response.data;
}
