import { Router } from "express";

import {
  getSettingsController,
  saveWalletsController,
  updateSettingsController,
} from "@/features/settings/setting.controller";
import {
  requirePlatformPermissions,
  requirePlatformRoles,
} from "@/shared/middleware/platform-auth";
import { requireMerchantKybApproved } from "@/shared/middleware/merchant-kyb";

const settingRouter = Router();

settingRouter.get("/:merchantId", getSettingsController);
settingRouter.patch(
  "/:merchantId",
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["team_admin"]),
  updateSettingsController
);
settingRouter.post(
  "/:merchantId/wallets/save",
  requireMerchantKybApproved("changing payout wallets in live mode"),
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["team_admin"]),
  saveWalletsController
);

export { settingRouter };
