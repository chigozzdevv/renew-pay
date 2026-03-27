import { Router } from "express";

import {
  confirmPendingPrimaryWalletChangeController,
  getSettingsController,
  promoteReserveWalletController,
  removeReserveWalletController,
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
  requireMerchantKybApproved("changing treasury wallets in live mode"),
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  saveWalletsController
);
settingRouter.post(
  "/:merchantId/wallets/confirm-primary",
  requireMerchantKybApproved("confirming treasury payout wallet changes in live mode"),
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  confirmPendingPrimaryWalletChangeController
);
settingRouter.post(
  "/:merchantId/wallets/promote-reserve",
  requireMerchantKybApproved("promoting treasury reserve wallets in live mode"),
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  promoteReserveWalletController
);
settingRouter.post(
  "/:merchantId/wallets/remove-reserve",
  requireMerchantKybApproved("removing treasury reserve wallets in live mode"),
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  removeReserveWalletController
);

export { settingRouter };
