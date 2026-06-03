import type { Request, Response } from "express";

import {
  createSettlementAccount,
  getDefaultSettlementAccount,
  getSettlementAccountById,
  listSettlementAssets,
  listSettlementAccounts,
  updateSettlementAccount,
} from "@/features/settlement/settlement.service";
import {
  createSettlementAccountSchema,
  listSettlementAccountsQuerySchema,
  settlementAssetCatalogQuerySchema,
  settlementAccountParamSchema,
  updateSettlementAccountSchema,
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

export const createSettlementAccountController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createSettlementAccountSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const account = await createSettlementAccount(input);

    response.status(201).json({
      success: true,
      message: "Settlement account created.",
      data: account,
    });
  }
);

export const listSettlementAccountsController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listSettlementAccountsQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const accounts = await listSettlementAccounts(query);

    response.status(200).json({
      success: true,
      data: accounts.items,
      ...(accounts.pagination ? { pagination: accounts.pagination } : {}),
    });
  }
);

export const listSettlementAssetsController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = settlementAssetCatalogQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const assets = listSettlementAssets(query.environment ?? "test");

    response.status(200).json({
      success: true,
      data: assets,
    });
  }
);

export const getSettlementAccountController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = settlementAccountParamSchema.parse(request.params);
    const account = await getSettlementAccountById(
      params.accountId,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      data: account,
    });
  }
);

export const getDefaultSettlementAccountController = asyncHandler(
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

    const account = await getDefaultSettlementAccount({
      merchantId,
      environment: resolveEnvironmentScope(request),
    });

    response.status(200).json({
      success: true,
      data: account,
    });
  }
);

export const updateSettlementAccountController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = settlementAccountParamSchema.parse(request.params);
    const input = updateSettlementAccountSchema.parse(request.body);
    const account = await updateSettlementAccount(
      params.accountId,
      input,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Settlement account updated.",
      data: account,
    });
  }
);
