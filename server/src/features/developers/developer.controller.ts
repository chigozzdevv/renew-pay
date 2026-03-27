import type { Request, Response } from "express";

import {
  createDeveloperKey,
  createTestDelivery,
  createWebhook,
  listDeliveries,
  listDeveloperKeys,
  listWebhooks,
  revokeDeveloperKey,
  rotateWebhookSecret,
  updateWebhook,
} from "@/features/developers/developer.service";
import {
  createDeveloperKeySchema,
  createTestDeliverySchema,
  createWebhookSchema,
  developerKeyActionSchema,
  developerKeyParamSchema,
  listDeliveriesQuerySchema,
  listDeveloperKeysQuerySchema,
  listWebhooksQuerySchema,
  updateWebhookSchema,
  webhookActionSchema,
  webhookParamSchema,
} from "@/features/developers/developer.validation";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";
import { asyncHandler } from "@/shared/utils/async-handler";

function resolveActor(request: Request) {
  return request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
}

function resolveMerchantScope(request: Request, fallback?: string) {
  return request.platformAuthUser?.merchantId ?? fallback;
}

function resolveEnvironmentScope(request: Request) {
  return optionalEnvironmentInputSchema.parse(
    typeof request.query.environment === "string"
      ? request.query.environment
      : request.body?.environment
  );
}

export const listDeveloperKeysController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listDeveloperKeysQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const keys = await listDeveloperKeys(query);

    response.status(200).json({
      success: true,
      data: keys.items,
      ...(keys.pagination ? { pagination: keys.pagination } : {}),
    });
  }
);

export const createDeveloperKeyController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createDeveloperKeySchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
      actor: resolveActor(request),
    });
    const result = await createDeveloperKey(input);

    response.status(201).json({
      success: true,
      message: "API key created.",
      data: result,
    });
  }
);

export const revokeDeveloperKeyController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = developerKeyParamSchema.parse(request.params);
    const input = developerKeyActionSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      actor: resolveActor(request),
    });
    const key = await revokeDeveloperKey(params.developerKeyId, input);

    response.status(200).json({
      success: true,
      message: "API key revoked.",
      data: key,
    });
  }
);

export const listWebhooksController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listWebhooksQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const webhooks = await listWebhooks(query);

    response.status(200).json({
      success: true,
      data: webhooks.items,
      ...(webhooks.pagination ? { pagination: webhooks.pagination } : {}),
    });
  }
);

export const createWebhookController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createWebhookSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
      actor: resolveActor(request),
    });
    const result = await createWebhook(input);

    response.status(201).json({
      success: true,
      message: "Webhook created.",
      data: result,
    });
  }
);

export const updateWebhookController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = webhookParamSchema.parse(request.params);
    const action = webhookActionSchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
      actor: resolveActor(request),
    });
    const input = updateWebhookSchema.parse({
      ...request.body,
      actor: resolveActor(request),
    });
    const webhook = await updateWebhook(
      params.webhookId,
      action.merchantId,
      action.environment,
      input
    );

    response.status(200).json({
      success: true,
      message: "Webhook updated.",
      data: webhook,
    });
  }
);

export const rotateWebhookSecretController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = webhookParamSchema.parse(request.params);
    const input = webhookActionSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
      actor: resolveActor(request),
    });
    const result = await rotateWebhookSecret(params.webhookId, input);

    response.status(200).json({
      success: true,
      message: "Webhook secret rotated.",
      data: result,
    });
  }
);

export const listDeliveriesController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listDeliveriesQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const deliveries = await listDeliveries(query);

    response.status(200).json({
      success: true,
      data: deliveries.items,
      ...(deliveries.pagination ? { pagination: deliveries.pagination } : {}),
    });
  }
);

export const createTestDeliveryController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = webhookParamSchema.parse(request.params);
    const input = createTestDeliverySchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
      actor: resolveActor(request),
    });
    const delivery = await createTestDelivery(params.webhookId, input);

    response.status(201).json({
      success: true,
      message: "Webhook test delivery triggered.",
      data: delivery,
    });
  }
);
