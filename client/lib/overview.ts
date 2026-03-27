"use client";

import { fetchApi } from "@/lib/api";

export type DashboardOverview = {
  stats: {
    totalCustomers: number;
    atRiskCustomers: number;
    activePlans: number;
    meteredPlans: number;
    activeSubscriptions: number;
    pendingSettlements: number;
    readyNetUsdc: number;
    settledUsdc30d: number;
  };
  marketMix: Array<{
    market: string;
    totalVolume: number;
    share: number;
  }>;
  upcomingRenewals: Array<{
    subscriptionId: string;
    customerName: string;
    planName: string;
    billingCurrency: string;
    localAmount: number;
    nextChargeAt: string;
  }>;
};

export async function loadDashboardOverview(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<DashboardOverview>("/dashboard/overview", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
    },
  });

  return response.data;
}
