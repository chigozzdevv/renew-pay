import type { Request, Response } from "express";

import {
  completeOnboarding,
  getOnboardingState,
  startOnboardingVerification,
  updateOnboardingBusinessProfile,
  updateOnboardingGovernance,
  updateOnboardingPayoutSettings,
} from "@/features/onboarding/onboarding.service";
import {
  onboardingBusinessProfileSchema,
  onboardingCompleteSchema,
  onboardingGovernanceSchema,
  onboardingPayoutSettingsSchema,
  onboardingQuerySchema,
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

export const updateOnboardingBusinessProfileController = asyncHandler(
  async (request: Request, response: Response) => {
    const scope = requireSessionScope(request);
    const payload = onboardingBusinessProfileSchema.parse(request.body);
    const onboarding = await updateOnboardingBusinessProfile({
      ...scope,
      actor: resolveActor(request),
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Business profile updated.",
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

export const updateOnboardingPayoutSettingsController = asyncHandler(
  async (request: Request, response: Response) => {
    const scope = requireSessionScope(request);
    const payload = onboardingPayoutSettingsSchema.parse(request.body);
    const onboarding = await updateOnboardingPayoutSettings({
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

export const updateOnboardingGovernanceController = asyncHandler(
  async (request: Request, response: Response) => {
    const scope = requireSessionScope(request);
    const payload = onboardingGovernanceSchema.parse(request.body);
    const onboarding = await updateOnboardingGovernance({
      ...scope,
      actor: resolveActor(request),
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Governance preference saved.",
      data: onboarding,
    });
  }
);

export const completeOnboardingController = asyncHandler(
  async (request: Request, response: Response) => {
    const scope = requireSessionScope(request);
    const payload = onboardingCompleteSchema.parse(request.body);
    const onboarding = await completeOnboarding({
      ...scope,
      actor: resolveActor(request),
      payload,
    });

    response.status(200).json({
      success: true,
      message: "Workspace onboarding completed.",
      data: onboarding,
    });
  }
);
