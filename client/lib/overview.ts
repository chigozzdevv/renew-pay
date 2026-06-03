"use client";

import { fetchApi } from "@/lib/api";

export type DashboardOverview = {
  stats: {
    totalCustomers: number;
    openPayments: number;
    paidPaymentsToday: number;
    failedPayments: number;
    pendingPayouts: number;
    activeSettlementAccounts: number;
    payoutReadyUsdc: number;
    settledUsdc30d: number;
  };
  marketMix: Array<{
    currency: string;
    totalVolume: number;
    count: number;
    share: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: "payment" | "payout";
    title: string;
    status: string;
    amount: number;
    currency: string;
    reference: string;
    createdAt: string;
  }>;
};

export async function loadDashboardOverview(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<DashboardOverview>("/overview", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
    },
  });

  return response.data;
}
