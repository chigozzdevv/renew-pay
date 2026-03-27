import type { Request, Response } from "express";

import {
  createCharge,
  getChargeById,
  listCharges,
  queueChargeRetry,
  updateCharge,
} from "@/features/charges/charge.service";
import {
  createChargeSchema,
  listChargesQuerySchema,
  updateChargeSchema,
} from "@/features/charges/charge.validation";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";
import { asyncHandler } from "@/shared/utils/async-handler";

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

export const createChargeController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createChargeSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const charge = await createCharge(input);

    response.status(201).json({
      success: true,
      message: "Charge recorded.",
      data: charge,
    });
  }
);

export const listChargesController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listChargesQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const charges = await listCharges(query);

    response.status(200).json({
      success: true,
      data: charges.items,
      ...(charges.pagination ? { pagination: charges.pagination } : {}),
    });
  }
);

export const getChargeController = asyncHandler(
  async (request: Request, response: Response) => {
    const charge = await getChargeById(
      String(request.params.chargeId),
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      data: charge,
    });
  }
);

export const updateChargeController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = updateChargeSchema.parse(request.body);
    const charge = await updateCharge(
      String(request.params.chargeId),
      input,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Charge updated.",
      data: charge,
    });
  }
);

export const retryChargeController = asyncHandler(
  async (request: Request, response: Response) => {
    const result = await queueChargeRetry(
      String(request.params.chargeId),
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(202).json({
      success: true,
      message: result.queued ? "Charge retry queued." : "Charge retried inline.",
      data: result,
    });
  }
);
