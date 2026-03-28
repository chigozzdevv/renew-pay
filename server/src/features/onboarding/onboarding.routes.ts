import { Router } from "express";

import {
  getOnboardingController,
  registerOnboardingMerchantController,
  saveOnboardingBusinessController,
  saveOnboardingPayoutController,
  startOnboardingVerificationController,
} from "@/features/onboarding/onboarding.controller";
import { requirePlatformAuth, requirePlatformRoles } from "@/shared/middleware/platform-auth";

const onboardingRouter = Router();

onboardingRouter.use(requirePlatformAuth);

onboardingRouter.get("/", getOnboardingController);
onboardingRouter.post(
  "/business",
  requirePlatformRoles(["owner", "admin"]),
  saveOnboardingBusinessController
);
onboardingRouter.post(
  "/verification/start",
  requirePlatformRoles(["owner", "admin"]),
  startOnboardingVerificationController
);
onboardingRouter.post(
  "/payout",
  requirePlatformRoles(["owner", "admin"]),
  saveOnboardingPayoutController
);
onboardingRouter.post(
  "/register",
  requirePlatformRoles(["owner"]),
  registerOnboardingMerchantController
);

export { onboardingRouter };
