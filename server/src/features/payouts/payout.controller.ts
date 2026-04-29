import type { Request, Response } from "express";

import {
  createPayout,
  getPayoutById,
  listPayouts,
  queuePayoutProcessing,
  updatePayout,
} from "@/features/payouts/payout.service";
import {
  createPayoutSchema,
  listPayoutsQuerySchema,
  payoutParamSchema,
  updatePayoutSchema,
} from "@/features/payouts/payout.validation";
import { asyncHandler } from "@/shared/utils/async-handler";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";

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

export const createPayoutController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createPayoutSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const payout = await createPayout(input);

    response.status(201).json({
      success: true,
      message: "Payout queued.",
      data: payout,
    });
  }
);

export const listPayoutsController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listPayoutsQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const payouts = await listPayouts(query);

    response.status(200).json({
      success: true,
      data: payouts,
    });
  }
);

export const getPayoutController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = payoutParamSchema.parse(request.params);
    const payout = await getPayoutById(
      params.payoutId,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      data: payout,
    });
  }
);

export const updatePayoutController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = payoutParamSchema.parse(request.params);
    const input = updatePayoutSchema.parse(request.body);
    const payout = await updatePayout(
      params.payoutId,
      input,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Payout updated.",
      data: payout,
    });
  }
);

export const processPayoutController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = payoutParamSchema.parse(request.params);
    const result = await queuePayoutProcessing(params.payoutId, {
      merchantId: resolveMerchantScope(request),
      environment: resolveEnvironmentScope(request),
    });

    response.status(202).json({
      success: true,
      message: result.queued ? "Payout processing queued." : "Payout processed inline.",
      data: result,
    });
  }
);
