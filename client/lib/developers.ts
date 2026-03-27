"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export const supportedWebhookEvents = [
  "charge.failed",
  "charge.settled",
] as const;

export type SupportedWebhookEvent = (typeof supportedWebhookEvents)[number];

export type DeveloperKeyRecord = {
  id: string;
  merchantId: string;
  label: string;
  environment: "sandbox" | "live";
  maskedToken: string;
  status: "active" | "revoked";
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookRecord = {
  id: string;
  merchantId: string;
  label: string;
  environment: "sandbox" | "live";
  endpointUrl: string;
  status: "active" | "disabled";
  eventTypes: SupportedWebhookEvent[];
  retryPolicy: "none" | "linear" | "exponential";
  lastDeliveryAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryRecord = {
  id: string;
  merchantId: string;
  webhookId: string;
  eventId: string;
  environment: "sandbox" | "live";
  eventType: SupportedWebhookEvent;
  status: "queued" | "delivered" | "failed";
  httpStatus: number | null;
  attempts: number;
  payload: Record<string, unknown>;
  errorMessage: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeveloperWorkspace = {
  keys: DeveloperKeyRecord[];
  webhooks: WebhookRecord[];
  deliveries: DeliveryRecord[];
  keysPagination: ApiPagination;
  webhooksPagination: ApiPagination;
  deliveriesPagination: ApiPagination;
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

export async function loadDeveloperWorkspace(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  keyPage?: number;
  keyLimit?: number;
  webhookPage?: number;
  webhookLimit?: number;
  deliveryPage?: number;
  deliveryLimit?: number;
  webhookId?: string | null;
}) {
  const keyPage = input.keyPage ?? 1;
  const keyLimit = input.keyLimit ?? 12;
  const webhookPage = input.webhookPage ?? 1;
  const webhookLimit = input.webhookLimit ?? 12;
  const deliveryPage = input.deliveryPage ?? 1;
  const deliveryLimit = input.deliveryLimit ?? 12;

  const [keysResponse, webhooksResponse, deliveriesResponse] = await Promise.all([
    fetchApi<DeveloperKeyRecord[]>("/developers/keys", {
        token: input.token,
        query: {
          merchantId: input.merchantId,
          environment: input.environment,
          page: keyPage,
          limit: keyLimit,
        },
    }),
    fetchApi<WebhookRecord[]>("/developers/webhooks", {
        token: input.token,
        query: {
          merchantId: input.merchantId,
          environment: input.environment,
          page: webhookPage,
          limit: webhookLimit,
        },
    }),
    fetchApi<DeliveryRecord[]>("/developers/deliveries", {
        token: input.token,
        query: {
          merchantId: input.merchantId,
          environment: input.environment,
          webhookId: input.webhookId ?? undefined,
          page: deliveryPage,
          limit: deliveryLimit,
        },
    }),
  ]);

  return {
    keys: keysResponse.data,
    webhooks: webhooksResponse.data,
    deliveries: deliveriesResponse.data,
    keysPagination: resolvePagination(
      keysResponse.pagination,
      keyPage,
      keyLimit,
      keysResponse.data.length
    ),
    webhooksPagination: resolvePagination(
      webhooksResponse.pagination,
      webhookPage,
      webhookLimit,
      webhooksResponse.data.length
    ),
    deliveriesPagination: resolvePagination(
      deliveriesResponse.pagination,
      deliveryPage,
      deliveryLimit,
      deliveriesResponse.data.length
    ),
  } satisfies DeveloperWorkspace;
}

export async function createDeveloperKey(input: {
  token: string;
  merchantId: string;
  label: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<{
    key: DeveloperKeyRecord;
    token: string;
  }>("/developers/keys", {
    method: "POST",
    token: input.token,
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function revokeDeveloperKey(input: {
  token: string;
  merchantId: string;
  developerKeyId: string;
}) {
  const response = await fetchApi<DeveloperKeyRecord>(
    `/developers/keys/${input.developerKeyId}/revoke`,
    {
      method: "POST",
      token: input.token,
      body: JSON.stringify({
        merchantId: input.merchantId,
      }),
    }
  );

  return response.data;
}

export async function createWebhook(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  label: string;
  endpointUrl: string;
  eventTypes: SupportedWebhookEvent[];
  retryPolicy: WebhookRecord["retryPolicy"];
}) {
  const response = await fetchApi<{
    webhook: WebhookRecord;
    secret: string;
  }>("/developers/webhooks", {
    method: "POST",
    token: input.token,
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function updateWebhook(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  webhookId: string;
  payload: Partial<{
    label: string;
    endpointUrl: string;
    eventTypes: SupportedWebhookEvent[];
    retryPolicy: WebhookRecord["retryPolicy"];
    status: WebhookRecord["status"];
  }>;
}) {
  const response = await fetchApi<WebhookRecord>(`/developers/webhooks/${input.webhookId}`, {
    method: "PATCH",
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
    },
    body: JSON.stringify(input.payload),
  });

  return response.data;
}

export async function rotateWebhookSecret(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  webhookId: string;
}) {
  const response = await fetchApi<{
    webhook: WebhookRecord;
    secret: string;
  }>(`/developers/webhooks/${input.webhookId}/rotate-secret`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
    }),
  });

  return response.data;
}

export async function sendWebhookTest(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  webhookId: string;
  eventType: SupportedWebhookEvent;
}) {
  const response = await fetchApi<DeliveryRecord>(`/developers/webhooks/${input.webhookId}/test`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
      eventType: input.eventType,
    }),
  });

  return response.data;
}
