import type { Request, Response } from "express";

import {
  confirmPendingPrimaryWalletChange,
  getSettingsByMerchantId,
  promoteReserveWallet,
  removeReserveWallet,
  saveWalletSettings,
  updateSettingsByMerchantId,
} from "@/features/settings/setting.service";
import {
  merchantParamSchema,
  saveWalletSchema,
  updateSettingsSchema,
  walletActionSchema,
} from "@/features/settings/setting.validation";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";
import { asyncHandler } from "@/shared/utils/async-handler";

function resolveEnvironmentScope(request: Request) {
  return optionalEnvironmentInputSchema.parse(
    typeof request.query.environment === "string"
      ? request.query.environment
      : request.body?.environment
  );
}

export const getSettingsController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = merchantParamSchema.parse(request.params);
    const settings = await getSettingsByMerchantId(
      params.merchantId,
      resolveEnvironmentScope(request) ?? "test"
    );

    response.status(200).json({
      success: true,
      data: settings,
    });
  }
);

export const updateSettingsController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = merchantParamSchema.parse(request.params);
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const input = updateSettingsSchema.parse({
      ...request.body,
      actor,
      environment: resolveEnvironmentScope(request),
    });
    const settings = await updateSettingsByMerchantId(params.merchantId, input);

    response.status(200).json({
      success: true,
      message: "Settings updated.",
      data: settings,
    });
  }
);

export const saveWalletsController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = merchantParamSchema.parse(request.params);
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const input = saveWalletSchema.parse({
      ...request.body,
      actor,
      environment: resolveEnvironmentScope(request),
    });
    const result = await saveWalletSettings(params.merchantId, input);

    response.status(200).json({
      success: true,
      message: "Treasury wallet change request created.",
      data: result,
    });
  }
);

export const promoteReserveWalletController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = merchantParamSchema.parse(request.params);
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const input = walletActionSchema.parse({
      ...request.body,
      actor,
      environment: resolveEnvironmentScope(request),
    });
    const result = await promoteReserveWallet(params.merchantId, input);

    response.status(200).json({
      success: true,
      message: "Reserve wallet promotion queued.",
      data: result,
    });
  }
);

export const removeReserveWalletController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = merchantParamSchema.parse(request.params);
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const input = walletActionSchema.parse({
      ...request.body,
      actor,
      environment: resolveEnvironmentScope(request),
    });
    const result = await removeReserveWallet(params.merchantId, input);

    response.status(200).json({
      success: true,
      message: "Reserve wallet removal queued.",
      data: result,
    });
  }
);

export const confirmPendingPrimaryWalletChangeController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = merchantParamSchema.parse(request.params);
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const input = walletActionSchema.parse({
      ...request.body,
      actor,
      environment: resolveEnvironmentScope(request),
    });
    const result = await confirmPendingPrimaryWalletChange(params.merchantId, input);

    response.status(200).json({
      success: true,
      message: "Payout wallet confirmation queued.",
      data: result,
    });
  }
);
