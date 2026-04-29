import type { Request, Response } from "express";

import { listHistory } from "@/features/history/history.service";
import { listHistoryQuerySchema } from "@/features/history/history.validation";
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

export const listHistoryController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listHistoryQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const history = await listHistory(query);

    response.status(200).json({
      success: true,
      data: history.items,
      pagination: history.pagination,
    });
  }
);
