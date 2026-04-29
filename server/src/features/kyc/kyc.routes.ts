import { Router } from "express";

import {
  getMerchantKybStatusController,
  getOwnerKycStatusController,
  processSumsubWebhookController,
  startMerchantKybController,
  startOwnerKycController,
  syncMerchantKybController,
  syncOwnerKycController,
} from "@/features/kyc/kyc.controller";
import {
  requirePlatformAuth,
  requirePlatformPermissions,
} from "@/shared/middleware/platform-auth";

const kycRouter = Router();

kycRouter.post("/webhooks/sumsub", processSumsubWebhookController);

kycRouter.use(requirePlatformAuth);

kycRouter.get(
  "/merchants/:merchantId",
  requirePlatformPermissions(["settings"]),
  getMerchantKybStatusController
);
kycRouter.post(
  "/merchants/:merchantId/start-kyb",
  requirePlatformPermissions(["settings"]),
  startMerchantKybController
);
kycRouter.post(
  "/merchants/:merchantId/sync",
  requirePlatformPermissions(["settings", "payments"]),
  syncMerchantKybController
);
kycRouter.get(
  "/owner",
  requirePlatformPermissions(["settings", "payments"]),
  getOwnerKycStatusController
);
kycRouter.post(
  "/owner/start-kyc",
  requirePlatformPermissions(["settings", "payments"]),
  startOwnerKycController
);
kycRouter.post(
  "/owner/sync",
  requirePlatformPermissions(["settings", "payments"]),
  syncOwnerKycController
);

export { kycRouter };
