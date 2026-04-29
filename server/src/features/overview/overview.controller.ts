import type { Request, Response } from "express";

import {
  overviewMarketCatalogQuerySchema,
  overviewMarketQuoteQuerySchema,
  overviewQuerySchema,
} from "@/features/overview/overview.validation";
import {
  getOverview,
  getOverviewMarketCatalog,
  getOverviewMarketQuote,
} from "@/features/overview/overview.service";
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

export const getOverviewController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = overviewQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const overview = await getOverview(query);

    response.status(200).json({
      success: true,
      data: overview,
    });
  }
);

export const getOverviewMarketCatalogController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = overviewMarketCatalogQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const catalog = await getOverviewMarketCatalog(query);

    response.status(200).json({
      success: true,
      data: catalog,
    });
  }
);

export const getOverviewMarketQuoteController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = overviewMarketQuoteQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const quote = await getOverviewMarketQuote(query);

    response.status(200).json({
      success: true,
      data: quote,
    });
  }
);
