import type { Request, Response } from "express";

import {
  createSettlementRoute,
  getDefaultSettlementRoute,
  getSettlementRouteById,
  listSettlementRoutes,
  updateSettlementRoute,
} from "@/features/settlement/settlement.service";
import {
  createSettlementRouteSchema,
  listSettlementRoutesQuerySchema,
  settlementRouteParamSchema,
  updateSettlementRouteSchema,
} from "@/features/settlement/settlement.validation";
import { asyncHandler } from "@/shared/utils/async-handler";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";

function resolveMerchantScope(request: Request, fallback?: string) {
  return request.platformAuthUser?.merchantId ?? request.developerAuth?.merchantId ?? fallback;
}

function resolveEnvironmentScope(request: Request) {
  return optionalEnvironmentInputSchema.parse(
    request.developerAuth?.environment ??
    (typeof request.query.environment === "string"
      ? request.query.environment
      : request.body?.environment)
  );
}

export const createSettlementRouteController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createSettlementRouteSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const route = await createSettlementRoute(input);

    response.status(201).json({
      success: true,
      message: "Settlement route created.",
      data: route,
    });
  }
);

export const listSettlementRoutesController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listSettlementRoutesQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const routes = await listSettlementRoutes(query);

    response.status(200).json({
      success: true,
      data: routes.items,
      ...(routes.pagination ? { pagination: routes.pagination } : {}),
    });
  }
);

export const getSettlementRouteController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = settlementRouteParamSchema.parse(request.params);
    const route = await getSettlementRouteById(
      params.routeId,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      data: route,
    });
  }
);

export const getDefaultSettlementRouteController = asyncHandler(
  async (request: Request, response: Response) => {
    const merchantId = resolveMerchantScope(
      request,
      typeof request.query.merchantId === "string"
        ? request.query.merchantId
        : undefined
    );

    if (!merchantId) {
      response.status(400).json({
        success: false,
        message: "Merchant scope is required.",
      });
      return;
    }

    const route = await getDefaultSettlementRoute({
      merchantId,
      environment: resolveEnvironmentScope(request),
    });

    response.status(200).json({
      success: true,
      data: route,
    });
  }
);

export const updateSettlementRouteController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = settlementRouteParamSchema.parse(request.params);
    const input = updateSettlementRouteSchema.parse(request.body);
    const route = await updateSettlementRoute(
      params.routeId,
      input,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Settlement route updated.",
      data: route,
    });
  }
);
