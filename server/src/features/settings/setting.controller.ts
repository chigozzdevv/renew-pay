import type { Request, Response } from "express";

import {
  getSettingsByMerchantId,
  saveWalletSettings,
  updateSettingsByMerchantId,
} from "@/features/settings/setting.service";
import {
  merchantParamSchema,
  saveWalletSchema,
  updateSettingsSchema,
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
      message: "Wallet settings updated.",
      data: result,
    });
  }
);
