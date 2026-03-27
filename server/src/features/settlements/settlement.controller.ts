import type { Request, Response } from "express";

import {
  createSettlement,
  getSettlementById,
  listSettlements,
  updateSettlement,
} from "@/features/settlements/settlement.service";
import {
  createSettlementSchema,
  listSettlementsQuerySchema,
  settlementParamSchema,
  updateSettlementSchema,
} from "@/features/settlements/settlement.validation";
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

export const createSettlementController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createSettlementSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const settlement = await createSettlement(input);

    response.status(201).json({
      success: true,
      message: "Settlement queued.",
      data: settlement,
    });
  }
);

export const listSettlementsController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listSettlementsQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const settlements = await listSettlements(query);

    response.status(200).json({
      success: true,
      data: settlements,
    });
  }
);

export const getSettlementController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = settlementParamSchema.parse(request.params);
    const merchantId = resolveMerchantScope(
      request,
      typeof request.query.merchantId === "string"
        ? request.query.merchantId
        : undefined
    );
    const settlement = await getSettlementById(
      params.settlementId,
      merchantId,
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      data: settlement,
    });
  }
);

export const updateSettlementController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = settlementParamSchema.parse(request.params);
    const input = updateSettlementSchema.parse(request.body);
    const merchantId = resolveMerchantScope(
      request,
      typeof request.query.merchantId === "string"
        ? request.query.merchantId
        : undefined
    );
    const settlement = await updateSettlement(
      params.settlementId,
      input,
      merchantId,
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Settlement updated.",
      data: settlement,
    });
  }
);
