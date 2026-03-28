import type { Request, Response } from "express";

import {
  registerOnboardingMerchant,
  getOnboardingState,
  saveOnboardingBusiness,
  saveOnboardingPayout,
  startOnboardingVerification,
} from "@/features/onboarding/onboarding.service";
import {
  onboardingBusinessSchema,
  onboardingPayoutSchema,
  onboardingQuerySchema,
  onboardingRegisterSchema,
  onboardingVerificationStartSchema,
} from "@/features/onboarding/onboarding.validation";
import { asyncHandler } from "@/shared/utils/async-handler";

function resolveActor(request: Request) {
  return request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
}

function requireSessionScope(request: Request) {
  const merchantId = request.platformAuthUser?.merchantId;
  const teamMemberId = request.platformAuthUser?.teamMemberId;

  if (!merchantId || !teamMemberId) {
    throw new Error("Authenticated onboarding scope is required.");
  }

  return {
    merchantId,
    teamMemberId,
  };
}

export const getOnboardingController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = onboardingQuerySchema.parse(request.query);
    const scope = requireSessionScope(request);
    const onboarding = await getOnboardingState({
      ...scope,
      environment: query.environment,
    });

    response.status(200).json({
      success: true,
      data: onboarding,
    });
  }
);

export const saveOnboardingBusinessController = asyncHandler(
  async (request: Request, response: Response) => {
    const scope = requireSessionScope(request);
    const payload = onboardingBusinessSchema.parse(request.body);
    const onboarding = await saveOnboardingBusiness({
      ...scope,
      actor: resolveActor(request),
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Business basics updated.",
      data: onboarding,
    });
  }
);

export const startOnboardingVerificationController = asyncHandler(
  async (request: Request, response: Response) => {
    const scope = requireSessionScope(request);
    const payload = onboardingVerificationStartSchema.parse(request.body);
    const result = await startOnboardingVerification({
      ...scope,
      actor: resolveActor(request),
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Verification session started.",
      data: result,
    });
  }
);

export const saveOnboardingPayoutController = asyncHandler(
  async (request: Request, response: Response) => {
    const scope = requireSessionScope(request);
    const payload = onboardingPayoutSchema.parse(request.body);
    const onboarding = await saveOnboardingPayout({
      ...scope,
      actor: resolveActor(request),
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Payout wallet updated.",
      data: onboarding,
    });
  }
);

export const registerOnboardingMerchantController = asyncHandler(
  async (request: Request, response: Response) => {
    const scope = requireSessionScope(request);
    const payload = onboardingRegisterSchema.parse(request.body);
    const onboarding = await registerOnboardingMerchant({
      ...scope,
      actor: resolveActor(request),
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Merchant registered.",
      data: onboarding,
    });
  }
);
