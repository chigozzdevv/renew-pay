import type { Request, Response } from "express";

import {
  addTreasuryOwner,
  approveTreasuryOperation,
  bootstrapTreasuryAccount,
  createTreasurySignerChallenge,
  executeTreasuryOperation,
  getTreasuryOperationSigningPayload,
  listPayoutBatchesByMerchantId,
  previewPayoutBatch,
  getTreasuryByMerchantId,
  removeTreasuryOwner,
  rejectTreasuryOperation,
  revokeTreasurySigner,
  updateTreasuryPayoutSettings,
  updateTreasuryThreshold,
  verifyTreasurySigner,
  withdrawPayoutBatch,
} from "@/features/treasury/treasury.service";
import {
  addTreasuryOwnerSchema,
  approveTreasuryOperationSchema,
  bootstrapTreasurySchema,
  createTreasurySignerChallengeSchema,
  payoutBatchPreviewSchema,
  payoutBatchQuerySchema,
  payoutSettingsSchema,
  rejectTreasuryOperationSchema,
  removeTreasuryOwnerSchema,
  treasuryMerchantParamSchema,
  treasuryOperationParamSchema,
  treasurySignerParamSchema,
  updateTreasuryThresholdSchema,
  verifyTreasurySignerSchema,
  withdrawPayoutBatchSchema,
} from "@/features/treasury/treasury.validation";
import { HttpError } from "@/shared/errors/http-error";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";
import { asyncHandler } from "@/shared/utils/async-handler";

function resolveActor(request: Request) {
  return request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
}

function resolveTeamMemberId(request: Request) {
  return request.platformAuthUser?.teamMemberId ?? null;
}

function resolveRequiredTeamMemberId(request: Request) {
  const teamMemberId = resolveTeamMemberId(request);

  if (!teamMemberId) {
    throw new HttpError(401, "Authenticated team member is required.");
  }

  return teamMemberId;
}

function resolveEnvironmentScope(request: Request) {
  return optionalEnvironmentInputSchema.parse(
    typeof request.query.environment === "string"
      ? request.query.environment
      : request.body?.environment
  );
}

export const getTreasuryController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryMerchantParamSchema.parse(request.params);
    const treasury = await getTreasuryByMerchantId(
      params.merchantId,
      resolveEnvironmentScope(request) ?? "test"
    );

    response.status(200).json({
      success: true,
      data: treasury,
    });
  }
);

export const listPayoutBatchesController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryMerchantParamSchema.parse(request.params);
    const query = payoutBatchQuerySchema.parse({
      environment: resolveEnvironmentScope(request),
    });
    const treasury = await listPayoutBatchesByMerchantId(
      params.merchantId,
      query.environment
    );

    response.status(200).json({
      success: true,
      data: treasury,
    });
  }
);

export const previewPayoutBatchController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryMerchantParamSchema.parse(request.params);
    const payload = payoutBatchPreviewSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const preview = await previewPayoutBatch({
      merchantId: params.merchantId,
      environment: payload.environment,
      trigger: payload.trigger,
    });

    response.status(200).json({
      success: true,
      data: preview,
    });
  }
);

export const updatePayoutSettingsController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryMerchantParamSchema.parse(request.params);
    const payload = payoutSettingsSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const treasury = await updateTreasuryPayoutSettings({
      merchantId: params.merchantId,
      actor: resolveActor(request),
      requesterTeamMemberId: resolveRequiredTeamMemberId(request),
      environment: payload.environment,
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Treasury payout settings updated.",
      data: treasury,
    });
  }
);

export const withdrawPayoutBatchController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryMerchantParamSchema.parse(request.params);
    const payload = withdrawPayoutBatchSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const result = await withdrawPayoutBatch({
      merchantId: params.merchantId,
      actor: resolveActor(request),
      requesterTeamMemberId: resolveRequiredTeamMemberId(request),
      environment: payload.environment,
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Treasury withdrawal started.",
      data: result,
    });
  }
);

export const bootstrapTreasuryController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryMerchantParamSchema.parse(request.params);
    const payload = bootstrapTreasurySchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const treasury = await bootstrapTreasuryAccount({
      merchantId: params.merchantId,
      actor: resolveActor(request),
      requesterTeamMemberId: resolveRequiredTeamMemberId(request),
      payload,
    });

    response.status(201).json({
      success: true,
      message: "Treasury governance configured.",
      data: treasury,
    });
  }
);

export const createTreasurySignerChallengeController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryMerchantParamSchema.parse(request.params);
    const teamMemberId = resolveRequiredTeamMemberId(request);
    const payload = createTreasurySignerChallengeSchema.parse(request.body);

    const challenge = await createTreasurySignerChallenge({
      merchantId: params.merchantId,
      teamMemberId,
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Treasury signer challenge created.",
      data: challenge,
    });
  }
);

export const verifyTreasurySignerController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryMerchantParamSchema.parse(request.params);
    const teamMemberId = resolveRequiredTeamMemberId(request);
    const payload = verifyTreasurySignerSchema.parse(request.body);

    const signer = await verifyTreasurySigner({
      merchantId: params.merchantId,
      teamMemberId,
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Treasury signer verified.",
      data: signer,
    });
  }
);

export const revokeTreasurySignerController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasurySignerParamSchema.parse(request.params);
    const signer = await revokeTreasurySigner({
      merchantId: params.merchantId,
      teamMemberId: params.teamMemberId,
      actor: resolveActor(request),
      requesterTeamMemberId: resolveRequiredTeamMemberId(request),
    });

    response.status(200).json({
      success: true,
      message: "Treasury signer revoked.",
      data: signer,
    });
  }
);

export const addTreasuryOwnerController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryMerchantParamSchema.parse(request.params);
    const payload = addTreasuryOwnerSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const operation = await addTreasuryOwner({
      merchantId: params.merchantId,
      actor: resolveActor(request),
      requesterTeamMemberId: resolveRequiredTeamMemberId(request),
      payload,
    });

    response.status(201).json({
      success: true,
      message: "Treasury approver change queued.",
      data: operation,
    });
  }
);

export const removeTreasuryOwnerController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasurySignerParamSchema.parse(request.params);
    const payload = removeTreasuryOwnerSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const operation = await removeTreasuryOwner({
      merchantId: params.merchantId,
      teamMemberId: params.teamMemberId,
      actor: resolveActor(request),
      requesterTeamMemberId: resolveRequiredTeamMemberId(request),
      payload,
    });

    response.status(201).json({
      success: true,
      message: "Treasury approver removal queued.",
      data: operation,
    });
  }
);

export const updateTreasuryThresholdController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryMerchantParamSchema.parse(request.params);
    const payload = updateTreasuryThresholdSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const operation = await updateTreasuryThreshold({
      merchantId: params.merchantId,
      actor: resolveActor(request),
      requesterTeamMemberId: resolveRequiredTeamMemberId(request),
      payload,
    });

    response.status(201).json({
      success: true,
      message: "Treasury approval threshold change queued.",
      data: operation,
    });
  }
);

export const getTreasuryOperationSigningPayloadController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryOperationParamSchema.parse(request.params);
    const teamMemberId = resolveRequiredTeamMemberId(request);

    const payload = await getTreasuryOperationSigningPayload({
      merchantId: request.platformAuthUser!.merchantId,
      operationId: params.operationId,
      teamMemberId,
    });

    response.status(200).json({
      success: true,
      data: payload,
    });
  }
);

export const approveTreasuryOperationController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryOperationParamSchema.parse(request.params);
    const teamMemberId = resolveRequiredTeamMemberId(request);
    const payload = approveTreasuryOperationSchema.parse(request.body);

    const operation = await approveTreasuryOperation({
      merchantId: request.platformAuthUser!.merchantId,
      operationId: params.operationId,
      teamMemberId,
      actor: resolveActor(request),
      signature: payload.signature,
    });

    response.status(200).json({
      success: true,
      message: "Treasury operation approved.",
      data: operation,
    });
  }
);

export const rejectTreasuryOperationController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryOperationParamSchema.parse(request.params);
    const payload = rejectTreasuryOperationSchema.parse(request.body);
    const operation = await rejectTreasuryOperation({
      merchantId: request.platformAuthUser!.merchantId,
      operationId: params.operationId,
      actor: resolveActor(request),
      requesterTeamMemberId: resolveRequiredTeamMemberId(request),
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Treasury operation rejected.",
      data: operation,
    });
  }
);

export const executeTreasuryOperationController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = treasuryOperationParamSchema.parse(request.params);
    const operation = await executeTreasuryOperation({
      merchantId: request.platformAuthUser!.merchantId,
      operationId: params.operationId,
      actor: resolveActor(request),
      requesterTeamMemberId: resolveRequiredTeamMemberId(request),
    });

    response.status(200).json({
      success: true,
      message: "Treasury operation submitted.",
      data: operation,
    });
  }
);
