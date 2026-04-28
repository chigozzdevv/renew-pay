import { Router } from "express";

import {
  getMerchantKybStatusController,
  getTeamMemberKycStatusController,
  processSumsubWebhookController,
  startMerchantKybController,
  startTeamMemberKycController,
  syncMerchantKybController,
  syncTeamMemberKycController,
} from "@/features/kyc/kyc.controller";
import {
  requirePlatformAuth,
  requirePlatformPermissions,
  requirePlatformRoles,
} from "@/shared/middleware/platform-auth";

const kycRouter = Router();

kycRouter.post("/webhooks/sumsub", processSumsubWebhookController);

kycRouter.use(requirePlatformAuth);

kycRouter.get(
  "/merchants/:merchantId",
  requirePlatformPermissions(["team_admin"]),
  getMerchantKybStatusController
);
kycRouter.post(
  "/merchants/:merchantId/start-kyb",
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["team_admin"]),
  startMerchantKybController
);
kycRouter.post(
  "/merchants/:merchantId/sync",
  requirePlatformRoles(["owner", "admin", "finance"]),
  requirePlatformPermissions(["team_admin", "payments"]),
  syncMerchantKybController
);

kycRouter.get(
  "/team-members/:teamMemberId",
  requirePlatformPermissions(["team_admin", "payments"]),
  getTeamMemberKycStatusController
);
kycRouter.post(
  "/team-members/:teamMemberId/start-kyc",
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["team_admin", "payments"]),
  startTeamMemberKycController
);
kycRouter.post(
  "/team-members/:teamMemberId/sync",
  requirePlatformRoles(["owner", "admin", "finance"]),
  requirePlatformPermissions(["team_admin", "payments"]),
  syncTeamMemberKycController
);

export { kycRouter };
