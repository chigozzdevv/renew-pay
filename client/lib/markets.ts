"use client";

import { fetchApi } from "@/lib/api";

export type CollectionMarketCatalogEntry = {
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

export type CollectionMarketCatalog = {
  merchantSupportedMarkets: string[];
  defaultMarket: string | null;
  markets: CollectionMarketCatalogEntry[];
};

export type CollectionMarketQuote = {
  currency: string;
  localAmount: number;
  usdcAmount: number;
  fxRate: number;
  feeAmount: number;
  expiresAt: string | null;
  settlementAsset: "USDC";
  settlementNetwork: "STELLAR";
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

export async function loadCollectionMarketCatalog(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<CollectionMarketCatalog>("/overview/market-catalog", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
    },
  });

  return response.data;
}
