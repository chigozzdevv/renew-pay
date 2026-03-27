import { createHash, randomBytes } from "crypto";

import { HttpError } from "@/shared/errors/http-error";

import { appendAuditLog } from "@/features/audit/audit.service";
import { DeveloperDeliveryModel } from "@/features/developers/developer-delivery.model";
import { DeveloperKeyModel } from "@/features/developers/developer-key.model";
import {
  createWebhookSecret,
  encryptWebhookSecret,
} from "@/features/developers/developer-webhook-crypto";
import { sendDeveloperWebhookTest } from "@/features/developers/developer-webhook-delivery.service";
import { DeveloperWebhookModel } from "@/features/developers/developer-webhook.model";
import type {
  CreateDeveloperKeyInput,
  CreateTestDeliveryInput,
  CreateWebhookInput,
  DeveloperKeyActionInput,
  ListDeliveriesQuery,
  ListDeveloperKeysQuery,
  ListWebhooksQuery,
  UpdateWebhookInput,
  WebhookActionInput,
} from "@/features/developers/developer.validation";
import { MerchantModel } from "@/features/merchants/merchant.model";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import {
  buildPagination,
  resolvePagination,
  type ListResult,
} from "@/shared/utils/pagination";
import {
  createRuntimeModeCondition,
  toPublicEnvironment,
} from "@/shared/utils/runtime-environment";

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createApiKeyToken(environment: "test" | "live") {
  const suffix = randomBytes(24).toString("hex");
  const prefix = environment === "live" ? "rw_live" : "rw_test";
  const token = `${prefix}_${suffix}`;

  return {
    prefix,
    token,
    hash: hashSecret(token),
    lastFour: token.slice(-4),
  };
}

function toDeveloperKeyResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  label: string;
  environment: string;
  prefix: string;
  lastFour: string;
  status: string;
  lastUsedAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    label: document.label,
    environment: toPublicEnvironment(
      document.environment === "live" ? "live" : "test"
    ),
    maskedToken: `${document.prefix}••••${document.lastFour}`,
    status: document.status,
    lastUsedAt: document.lastUsedAt ?? null,
    revokedAt: document.revokedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toWebhookResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  label: string;
  environment: string;
  endpointUrl: string;
  status: string;
  eventTypes: string[];
  retryPolicy: string;
  lastDeliveryAt?: Date | null;
  disabledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    label: document.label,
    environment: toPublicEnvironment(
      document.environment === "live" ? "live" : "test"
    ),
    endpointUrl: document.endpointUrl,
    status: document.status,
    eventTypes: document.eventTypes,
    retryPolicy: document.retryPolicy,
    lastDeliveryAt: document.lastDeliveryAt ?? null,
    disabledAt: document.disabledAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toDeliveryResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  webhookId: { toString(): string };
  eventId: string;
  environment: string;
  eventType: string;
  status: string;
  httpStatus?: number | null;
  attempts: number;
  payload?: Record<string, unknown>;
  errorMessage?: string | null;
  deliveredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    webhookId: document.webhookId.toString(),
    eventId: document.eventId,
    environment: toPublicEnvironment(
      document.environment === "live" ? "live" : "test"
    ),
    eventType: document.eventType,
    status: document.status,
    httpStatus: document.httpStatus ?? null,
    attempts: document.attempts,
    payload: document.payload ?? {},
    errorMessage: document.errorMessage ?? null,
    deliveredAt: document.deliveredAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function ensureMerchant(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

async function ensureDeveloperKey(developerKeyId: string, merchantId: string) {
  const key = await DeveloperKeyModel.findOne({
    _id: developerKeyId,
    merchantId,
  }).exec();

  if (!key) {
    throw new HttpError(404, "Developer key was not found.");
  }

  return key;
}

async function ensureWebhook(
  webhookId: string,
  merchantId: string,
  environment?: RuntimeMode
) {
  const mongoQuery: Record<string, unknown> = {
    _id: webhookId,
    merchantId,
  };

  if (environment) {
    Object.assign(mongoQuery, createRuntimeModeCondition("environment", environment));
  }

  const webhook = await DeveloperWebhookModel.findOne(mongoQuery).exec();

  if (!webhook) {
    throw new HttpError(404, "Webhook endpoint was not found.");
  }

  return webhook;
}

export async function listDeveloperKeys(query: ListDeveloperKeysQuery) {
  await ensureMerchant(query.merchantId);

  const mongoQuery: Record<string, unknown> = {
    merchantId: query.merchantId,
  };

  if (query.environment) {
    mongoQuery.environment = query.environment;
  }

  if (query.status) {
    mongoQuery.status = query.status;
  }

  const pagination = resolvePagination(query);

  if (!pagination) {
    const keys = await DeveloperKeyModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .exec();

    return {
      items: keys.map(toDeveloperKeyResponse),
    } satisfies ListResult<ReturnType<typeof toDeveloperKeyResponse>>;
  }

  const [total, keys] = await Promise.all([
    DeveloperKeyModel.countDocuments(mongoQuery).exec(),
    DeveloperKeyModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: keys.map(toDeveloperKeyResponse),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toDeveloperKeyResponse>>;
}

export async function createDeveloperKey(input: CreateDeveloperKeyInput) {
  await ensureMerchant(input.merchantId);

  const token = createApiKeyToken(input.environment);
  const key = await DeveloperKeyModel.create({
    merchantId: input.merchantId,
    label: input.label,
    environment: input.environment,
    prefix: token.prefix,
    tokenHash: token.hash,
    lastFour: token.lastFour,
    status: "active",
    lastUsedAt: null,
    revokedAt: null,
  });

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Created API key",
    category: "developer",
    status: "ok",
    target: input.label,
    detail: `API key ${input.label} created for ${toPublicEnvironment(input.environment)} environment.`,
    metadata: {
      keyId: key._id.toString(),
      environment: toPublicEnvironment(input.environment),
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    key: toDeveloperKeyResponse(key),
    token: token.token,
  };
}

export async function revokeDeveloperKey(
  developerKeyId: string,
  input: DeveloperKeyActionInput
) {
  await ensureMerchant(input.merchantId);
  const key = await ensureDeveloperKey(developerKeyId, input.merchantId);

  if (key.status === "revoked") {
    return toDeveloperKeyResponse(key);
  }

  key.status = "revoked";
  key.revokedAt = new Date();
  await key.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Revoked API key",
    category: "developer",
    status: "warning",
    target: key.label,
    detail: `API key ${key.label} was revoked.`,
    metadata: {
      keyId: key._id.toString(),
      environment: toPublicEnvironment(key.environment === "live" ? "live" : "test"),
    },
    ipAddress: null,
    userAgent: null,
  });

  return toDeveloperKeyResponse(key);
}

export async function listWebhooks(query: ListWebhooksQuery) {
  await ensureMerchant(query.merchantId);

  const filters: Record<string, unknown>[] = [
    {
      merchantId: query.merchantId,
    },
  ];

  if (query.environment) {
    filters.push(createRuntimeModeCondition("environment", query.environment));
  }

  if (query.status) {
    filters.push({
      status: query.status,
    });
  }

  const mongoQuery =
    filters.length === 1
      ? filters[0]
      : {
          $and: filters,
        };

  const pagination = resolvePagination(query);

  if (!pagination) {
    const webhooks = await DeveloperWebhookModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .exec();

    return {
      items: webhooks.map(toWebhookResponse),
    } satisfies ListResult<ReturnType<typeof toWebhookResponse>>;
  }

  const [total, webhooks] = await Promise.all([
    DeveloperWebhookModel.countDocuments(mongoQuery).exec(),
    DeveloperWebhookModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: webhooks.map(toWebhookResponse),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toWebhookResponse>>;
}

export async function createWebhook(input: CreateWebhookInput) {
  await ensureMerchant(input.merchantId);
  const secret = createWebhookSecret();

  const webhook = await DeveloperWebhookModel.create({
    merchantId: input.merchantId,
    environment: input.environment,
    label: input.label,
    endpointUrl: input.endpointUrl,
    eventTypes: input.eventTypes,
    retryPolicy: input.retryPolicy,
    status: "active",
    secretCiphertext: encryptWebhookSecret(secret),
    lastDeliveryAt: null,
    disabledAt: null,
  });

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Created webhook",
    category: "developer",
    status: "ok",
    target: input.endpointUrl,
    detail: `Webhook ${input.label} created.`,
    metadata: {
      webhookId: webhook._id.toString(),
      environment: toPublicEnvironment(input.environment),
      events: input.eventTypes,
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    webhook: toWebhookResponse(webhook),
    secret,
  };
}

export async function updateWebhook(
  webhookId: string,
  merchantId: string,
  environment: RuntimeMode,
  input: UpdateWebhookInput
) {
  await ensureMerchant(merchantId);
  const webhook = await ensureWebhook(webhookId, merchantId, environment);

  if (input.label !== undefined) {
    webhook.label = input.label;
  }

  if (input.endpointUrl !== undefined) {
    webhook.endpointUrl = input.endpointUrl;
  }

  if (input.eventTypes !== undefined) {
    webhook.eventTypes = input.eventTypes;
  }

  if (input.retryPolicy !== undefined) {
    webhook.retryPolicy = input.retryPolicy;
  }

  if (input.status !== undefined) {
    webhook.status = input.status;
    webhook.disabledAt = input.status === "disabled" ? new Date() : null;
  }

  await webhook.save();

  await appendAuditLog({
    merchantId,
    actor: input.actor,
    action: "Updated webhook",
    category: "developer",
    status: "ok",
    target: webhook.endpointUrl,
    detail: `Webhook ${webhook.label} was updated.`,
    metadata: {
      webhookId: webhook._id.toString(),
      status: webhook.status,
      retryPolicy: webhook.retryPolicy,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toWebhookResponse(webhook);
}

export async function rotateWebhookSecret(
  webhookId: string,
  input: WebhookActionInput
) {
  await ensureMerchant(input.merchantId);
  const webhook = await ensureWebhook(
    webhookId,
    input.merchantId,
    input.environment
  );
  const secret = createWebhookSecret();

  webhook.secretCiphertext = encryptWebhookSecret(secret);
  await webhook.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Rotated webhook secret",
    category: "security",
    status: "warning",
    target: webhook.endpointUrl,
    detail: `Webhook secret rotated for ${webhook.label}.`,
    metadata: {
      webhookId: webhook._id.toString(),
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    webhook: toWebhookResponse(webhook),
    secret,
  };
}

export async function listDeliveries(query: ListDeliveriesQuery) {
  await ensureMerchant(query.merchantId);

  const filters: Record<string, unknown>[] = [
    {
      merchantId: query.merchantId,
    },
  ];

  if (query.environment) {
    filters.push(createRuntimeModeCondition("environment", query.environment));
  }

  if (query.webhookId) {
    filters.push({
      webhookId: query.webhookId,
    });
  }

  if (query.status) {
    filters.push({
      status: query.status,
    });
  }

  if (query.eventType) {
    filters.push({
      eventType: query.eventType,
    });
  }

  const mongoQuery =
    filters.length === 1
      ? filters[0]
      : {
          $and: filters,
        };

  const pagination = resolvePagination(query, query.limit ?? 20);

  if (!pagination) {
    const deliveries = await DeveloperDeliveryModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .exec();

    return {
      items: deliveries.map(toDeliveryResponse),
    } satisfies ListResult<ReturnType<typeof toDeliveryResponse>>;
  }

  const [total, deliveries] = await Promise.all([
    DeveloperDeliveryModel.countDocuments(mongoQuery).exec(),
    DeveloperDeliveryModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: deliveries.map(toDeliveryResponse),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toDeliveryResponse>>;
}

export async function createTestDelivery(
  webhookId: string,
  input: CreateTestDeliveryInput
) {
  await ensureMerchant(input.merchantId);
  const webhook = await ensureWebhook(webhookId, input.merchantId, input.environment);

  if (webhook.status !== "active") {
    throw new HttpError(409, "Webhook must be active to send a test delivery.");
  }

  const delivery = await sendDeveloperWebhookTest({
    merchantId: input.merchantId,
    environment: input.environment,
    webhookId,
    eventType: input.eventType,
  });

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Sent webhook test event",
    category: "developer",
    status: "ok",
    target: webhook.endpointUrl,
    detail: `Test delivery triggered for ${webhook.label}.`,
    metadata: {
      webhookId: webhook._id.toString(),
      deliveryId: delivery._id.toString(),
      eventType: input.eventType,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toDeliveryResponse(delivery);
}
