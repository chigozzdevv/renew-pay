import { Router } from "express";

import {
  completeOnboardingController,
  getOnboardingController,
  startOnboardingVerificationController,
  updateOnboardingBusinessProfileController,
  updateOnboardingGovernanceController,
  updateOnboardingPayoutSettingsController,
} from "@/features/onboarding/onboarding.controller";
import { requirePlatformAuth, requirePlatformRoles } from "@/shared/middleware/platform-auth";

const onboardingRouter = Router();

onboardingRouter.use(requirePlatformAuth);

onboardingRouter.get("/", getOnboardingController);
onboardingRouter.post(
  "/business-profile",
  requirePlatformRoles(["owner", "admin"]),
  updateOnboardingBusinessProfileController
);
onboardingRouter.post(
  "/verification/start",
  requirePlatformRoles(["owner", "admin"]),
  startOnboardingVerificationController
);
onboardingRouter.post(
  "/payout-settings",
  requirePlatformRoles(["owner", "admin"]),
  updateOnboardingPayoutSettingsController
);
onboardingRouter.post(
  "/governance",
  requirePlatformRoles(["owner", "admin"]),
  updateOnboardingGovernanceController
);
onboardingRouter.post(
  "/complete",
  requirePlatformRoles(["owner", "admin"]),
  completeOnboardingController
);

export { onboardingRouter };
