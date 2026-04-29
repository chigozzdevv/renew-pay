import { Router } from "express";

import {
  getSettingsController,
  saveWalletsController,
  updateSettingsController,
} from "@/features/settings/setting.controller";
import { requirePlatformPermissions } from "@/shared/middleware/platform-auth";
import { requireMerchantKybApproved } from "@/shared/middleware/merchant-kyb";

const settingRouter = Router();

settingRouter.get("/:merchantId", getSettingsController);
settingRouter.patch(
  "/:merchantId",
  requirePlatformPermissions(["settings"]),
  updateSettingsController
);
settingRouter.post(
  "/:merchantId/wallets/save",
  requireMerchantKybApproved("changing payout wallets in live mode"),
  requirePlatformPermissions(["settings"]),
  saveWalletsController
);

export { settingRouter };
