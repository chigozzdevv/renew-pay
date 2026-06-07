import type { Request, Response } from "express";

import {
  getMerchantKybStatusByMerchantId,
  getOwnerKycStatusByMerchantId,
  processDiditWebhook,
  startMerchantKybSession,
  startOwnerKycSession,
  syncMerchantKybStatus,
  syncOwnerKycStatus,
} from "@/features/kyc/kyc.service";
import {
  merchantKybParamSchema,
  merchantKybStatusQuerySchema,
  ownerKycStatusQuerySchema,
  diditWebhookSchema,
  startMerchantKybSchema,
  startOwnerKycSchema,
  syncMerchantKybSchema,
  syncOwnerKycSchema,
} from "@/features/kyc/kyc.validation";
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

export const getMerchantKybStatusController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = merchantKybParamSchema.parse(request.params);
    const query = merchantKybStatusQuerySchema.parse({
      merchantId: resolveMerchantScope(request, params.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const status = await getMerchantKybStatusByMerchantId(query.merchantId);

    response.status(200).json({
      success: true,
      data: status,
    });
  }
);

export const startMerchantKybController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = merchantKybParamSchema.parse(request.params);
    const input = startMerchantKybSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, params.merchantId),
      actor: resolveActor(request),
      environment: resolveEnvironmentScope(request),
    });
    const result = await startMerchantKybSession(input);

    response.status(200).json({
      success: true,
      message: "Merchant KYB session started.",
      data: result,
    });
  }
);

export const syncMerchantKybController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = merchantKybParamSchema.parse(request.params);
    const input = syncMerchantKybSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, params.merchantId),
      actor: resolveActor(request),
      environment: resolveEnvironmentScope(request),
    });
    const result = await syncMerchantKybStatus(input);

    response.status(200).json({
      success: true,
      message: "Merchant KYB status synced.",
      data: result,
    });
  }
);

export const getOwnerKycStatusController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = ownerKycStatusQuerySchema.parse({
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const status = await getOwnerKycStatusByMerchantId(query);

    response.status(200).json({
      success: true,
      data: status,
    });
  }
);

export const startOwnerKycController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = startOwnerKycSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      actor: resolveActor(request),
      environment: resolveEnvironmentScope(request),
    });
    const result = await startOwnerKycSession(input);

    response.status(200).json({
      success: true,
      message: "Owner KYC session started.",
      data: result,
    });
  }
);

export const syncOwnerKycController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = syncOwnerKycSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      actor: resolveActor(request),
      environment: resolveEnvironmentScope(request),
    });
    const result = await syncOwnerKycStatus(input);

    response.status(200).json({
      success: true,
      message: "Owner KYC status synced.",
      data: result,
    });
  }
);

export const processDiditWebhookController = asyncHandler(
  async (request: Request, response: Response) => {
    const payload = diditWebhookSchema.parse({
      ...request.body,
    });
    const result = await processDiditWebhook({
      payload,
      rawBody: request.rawBody ?? JSON.stringify(payload),
      timestampHeader: request.header("x-timestamp") ?? null,
      signatureHeader: request.header("x-signature") ?? null,
      signatureV2Header: request.header("x-signature-v2") ?? null,
      signatureSimpleHeader: request.header("x-signature-simple") ?? null,
    });

    response.status(200).json({
      success: true,
      message: "Verification webhook processed.",
      data: result,
    });
  }
);
