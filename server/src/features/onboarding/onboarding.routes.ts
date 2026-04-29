import { Router } from "express";

import {
  getOnboardingController,
  registerOnboardingMerchantController,
  saveOnboardingBusinessController,
  saveOnboardingPayoutController,
  startOnboardingVerificationController,
} from "@/features/onboarding/onboarding.controller";
import { requirePlatformAuth } from "@/shared/middleware/platform-auth";

const onboardingRouter = Router();

onboardingRouter.use(requirePlatformAuth);

onboardingRouter.get("/", getOnboardingController);
onboardingRouter.post("/business", saveOnboardingBusinessController);
onboardingRouter.post(
  "/verification/start",
  startOnboardingVerificationController
);
onboardingRouter.post("/payout", saveOnboardingPayoutController);
onboardingRouter.post("/register", registerOnboardingMerchantController);

export { onboardingRouter };
