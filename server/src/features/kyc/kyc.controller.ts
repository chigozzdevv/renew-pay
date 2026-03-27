import type { Request, Response } from "express";

import {
  getMerchantKybStatusByMerchantId,
  getTeamMemberKycStatusById,
  processSumsubWebhook,
  startMerchantKybSession,
  startTeamMemberKycSession,
  syncMerchantKybStatus,
  syncTeamMemberKycStatus,
} from "@/features/kyc/kyc.service";
import {
  merchantKybParamSchema,
  merchantKybStatusQuerySchema,
  startMerchantKybSchema,
  startTeamMemberKycSchema,
  sumsubWebhookSchema,
  syncMerchantKybSchema,
  syncTeamMemberKycSchema,
  teamMemberKycParamSchema,
  teamMemberKycStatusQuerySchema,
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
    const status = await getMerchantKybStatusByMerchantId(
      query.merchantId,
      query.environment ?? "test"
    );

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

export const getTeamMemberKycStatusController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = teamMemberKycParamSchema.parse(request.params);
    const query = teamMemberKycStatusQuerySchema.parse({
      teamMemberId: params.teamMemberId,
      merchantId: resolveMerchantScope(request),
      environment: resolveEnvironmentScope(request),
    });
    const status = await getTeamMemberKycStatusById(query);

    response.status(200).json({
      success: true,
      data: status,
    });
  }
);

export const startTeamMemberKycController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = teamMemberKycParamSchema.parse(request.params);
    const input = startTeamMemberKycSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      teamMemberId: params.teamMemberId,
      actor: resolveActor(request),
      environment: resolveEnvironmentScope(request),
    });
    const result = await startTeamMemberKycSession(input);

    response.status(200).json({
      success: true,
      message: "Team member KYC session started.",
      data: result,
    });
  }
);

export const syncTeamMemberKycController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = teamMemberKycParamSchema.parse(request.params);
    const input = syncTeamMemberKycSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      teamMemberId: params.teamMemberId,
      actor: resolveActor(request),
      environment: resolveEnvironmentScope(request),
    });
    const result = await syncTeamMemberKycStatus(input);

    response.status(200).json({
      success: true,
      message: "Team member KYC status synced.",
      data: result,
    });
  }
);

export const processSumsubWebhookController = asyncHandler(
  async (request: Request, response: Response) => {
    const payload = sumsubWebhookSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const result = await processSumsubWebhook({
      payload,
      rawBody: request.rawBody ?? JSON.stringify(payload),
      digestHeader: request.header("x-payload-digest") ?? null,
      digestAlgorithmHeader: request.header("x-payload-digest-alg") ?? null,
      environment: payload.environment ?? undefined,
    });

    response.status(200).json({
      success: true,
      message: "Sumsub webhook processed.",
      data: result,
    });
  }
);
