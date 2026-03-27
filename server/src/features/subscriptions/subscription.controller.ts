import type { Request, Response } from "express";

import {
  createSubscription,
  getSubscriptionById,
  listSubscriptions,
  queueSubscriptionCharge,
  updateSubscription,
} from "@/features/subscriptions/subscription.service";
import {
  createSubscriptionSchema,
  listSubscriptionsQuerySchema,
  updateSubscriptionSchema,
} from "@/features/subscriptions/subscription.validation";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";
import { asyncHandler } from "@/shared/utils/async-handler";

function resolveMerchantScope(request: Request, fallback?: string) {
  return request.platformAuthUser?.merchantId ?? fallback;
}

function resolveActor(request: Request) {
  return request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
}

function resolveEnvironmentScope(request: Request) {
  return optionalEnvironmentInputSchema.parse(
    typeof request.query.environment === "string"
      ? request.query.environment
      : request.body?.environment
  );
}

export const createSubscriptionController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createSubscriptionSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const subscription = await createSubscription(input, resolveActor(request));

    response.status(201).json({
      success: true,
      message: "Subscription created.",
      data: subscription,
    });
  }
);

export const listSubscriptionsController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listSubscriptionsQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const subscriptions = await listSubscriptions(query);

    response.status(200).json({
      success: true,
      data: subscriptions.items,
      ...(subscriptions.pagination ? { pagination: subscriptions.pagination } : {}),
    });
  }
);

export const getSubscriptionController = asyncHandler(
  async (request: Request, response: Response) => {
    const subscription = await getSubscriptionById(
      String(request.params.subscriptionId),
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      data: subscription,
    });
  }
);

export const updateSubscriptionController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = updateSubscriptionSchema.parse(request.body);
    const subscription = await updateSubscription(
      String(request.params.subscriptionId),
      input,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request),
      resolveActor(request)
    );

    response.status(200).json({
      success: true,
      message: "Subscription updated.",
      data: subscription,
    });
  }
);

export const queueSubscriptionChargeController = asyncHandler(
  async (request: Request, response: Response) => {
    const result = await queueSubscriptionCharge(
      String(request.params.subscriptionId),
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(202).json({
      success: true,
      message: result.queued
        ? "Subscription charge queued."
        : "Subscription charge processed inline.",
      data: result,
    });
  }
);
