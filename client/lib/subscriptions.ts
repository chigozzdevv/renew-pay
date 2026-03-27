"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";
import { loadPlans, type OnchainRecord, type PlanRecord } from "@/lib/plans";

export type SubscriptionRecord = {
  id: string;
  merchantId: string;
  planId: string;
  customerRef: string;
  customerName: string;
  billingCurrency: string;
  localAmount: number;
  paymentAccountType: "bank" | "momo";
  paymentAccountNumber: string | null;
  paymentNetworkId: string | null;
  status: "pending_activation" | "active" | "paused" | "cancelled" | "past_due";
  pendingStatus?: "active" | "paused" | "cancelled" | "past_due" | null;
  nextChargeAt: string;
  lastChargeAt: string | null;
  retryAvailableAt: string | null;
  onchain: OnchainRecord;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionWorkspace = {
  subscriptions: SubscriptionRecord[];
  plans: PlanRecord[];
};

export type SubscriptionPage = {
  subscriptions: SubscriptionRecord[];
  pagination: ApiPagination;
};

export type SubscriptionWorkspacePage = SubscriptionWorkspace & {
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

export async function loadSubscriptions(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: SubscriptionRecord["status"] | "all";
  search?: string;
}) {
  const subscriptionsResponse = await fetchApi<SubscriptionRecord[]>("/subscriptions", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      status: input.status && input.status !== "all" ? input.status : undefined,
      search: input.search?.trim() || undefined,
    },
  });

  return subscriptionsResponse.data;
}

export async function loadSubscriptionsPage(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: SubscriptionRecord["status"] | "all";
  search?: string;
  page: number;
  limit?: number;
}) {
  const limit = input.limit ?? 20;
  const subscriptionsResponse = await fetchApi<SubscriptionRecord[]>("/subscriptions", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      status: input.status && input.status !== "all" ? input.status : undefined,
      search: input.search?.trim() || undefined,
      page: input.page,
      limit,
    },
  });

  return {
    subscriptions: subscriptionsResponse.data,
    pagination: resolvePagination(
      subscriptionsResponse.pagination,
      input.page,
      limit,
      subscriptionsResponse.data.length
    ),
  } satisfies SubscriptionPage;
}

export async function loadSubscriptionWorkspace(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: SubscriptionRecord["status"] | "all";
  search?: string;
}) {
  const [subscriptionsResponse, plans] = await Promise.all([
    loadSubscriptions(input),
    loadPlans({
      token: input.token,
      merchantId: input.merchantId,
      environment: input.environment,
      status: "all",
    }),
  ]);

  return {
    subscriptions: subscriptionsResponse,
    plans,
  } satisfies SubscriptionWorkspace;
}

export async function loadSubscriptionWorkspacePage(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: SubscriptionRecord["status"] | "all";
  search?: string;
  page: number;
  limit?: number;
}) {
  const [subscriptionPage, plans] = await Promise.all([
    loadSubscriptionsPage(input),
    loadPlans({
      token: input.token,
      merchantId: input.merchantId,
      environment: input.environment,
      status: "all",
    }),
  ]);

  return {
    subscriptions: subscriptionPage.subscriptions,
    plans,
    pagination: subscriptionPage.pagination,
  } satisfies SubscriptionWorkspacePage;
}

export async function createSubscription(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  planId: string;
  customerRef: string;
  customerName: string;
  billingCurrency: string;
  localAmount?: number;
  nextChargeAt: string;
  paymentAccountType: SubscriptionRecord["paymentAccountType"];
}) {
  const response = await fetchApi<SubscriptionRecord>("/subscriptions", {
    method: "POST",
    token: input.token,
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function updateSubscription(input: {
  token: string;
  subscriptionId: string;
  environment: "test" | "live";
  payload: Partial<{
    status: SubscriptionRecord["status"];
    nextChargeAt: string;
    localAmount: number;
    paymentAccountType: SubscriptionRecord["paymentAccountType"];
  }>;
}) {
  const response = await fetchApi<SubscriptionRecord>(`/subscriptions/${input.subscriptionId}`, {
    method: "PATCH",
    token: input.token,
    query: {
      environment: input.environment,
    },
    body: JSON.stringify(input.payload),
  });

  return response.data;
}

export async function queueSubscriptionCharge(input: {
  token: string;
  subscriptionId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<{
    queued: boolean;
    processedInline?: boolean;
    subscriptionId: string;
  }>(`/subscriptions/${input.subscriptionId}/queue-charge`, {
    method: "POST",
    token: input.token,
    query: {
      environment: input.environment,
    },
  });

  return response.data;
}
