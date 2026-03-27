import { Router } from "express";

import {
  addTreasuryOwnerController,
  approveTreasuryOperationController,
  bootstrapTreasuryController,
  createTreasurySignerChallengeController,
  executeTreasuryOperationController,
  getTreasuryOperationSigningPayloadController,
  listPayoutBatchesController,
  previewPayoutBatchController,
  getTreasuryController,
  removeTreasuryOwnerController,
  rejectTreasuryOperationController,
  revokeTreasurySignerController,
  updatePayoutSettingsController,
  updateTreasuryThresholdController,
  verifyTreasurySignerController,
  withdrawPayoutBatchController,
} from "@/features/treasury/treasury.controller";
import {
  requirePlatformPermissions,
  requirePlatformRoles,
} from "@/shared/middleware/platform-auth";
import { requireMerchantKybApproved } from "@/shared/middleware/merchant-kyb";

const treasuryRouter = Router();

treasuryRouter.get(
  "/:merchantId",
  requirePlatformPermissions(["treasury", "team_admin"]),
  getTreasuryController
);
treasuryRouter.get(
  "/:merchantId/payout-batches",
  requirePlatformPermissions(["treasury", "team_admin"]),
  listPayoutBatchesController
);
treasuryRouter.post(
  "/:merchantId/payout-batches/preview",
  requirePlatformRoles(["owner", "admin", "finance"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  previewPayoutBatchController
);
treasuryRouter.post(
  "/:merchantId/withdraw",
  requireMerchantKybApproved("withdrawing treasury balances in live mode"),
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  withdrawPayoutBatchController
);
treasuryRouter.patch(
  "/:merchantId/payout-settings",
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  updatePayoutSettingsController
);

treasuryRouter.post(
  "/:merchantId/bootstrap",
  requireMerchantKybApproved("configuring treasury governance in live mode"),
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  bootstrapTreasuryController
);

treasuryRouter.post(
  "/:merchantId/signers/challenge",
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  createTreasurySignerChallengeController
);

treasuryRouter.post(
  "/:merchantId/signers/verify",
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  verifyTreasurySignerController
);

treasuryRouter.delete(
  "/:merchantId/signers/:teamMemberId",
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  revokeTreasurySignerController
);

treasuryRouter.post(
  "/:merchantId/owners",
  requireMerchantKybApproved("updating treasury approvers in live mode"),
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  addTreasuryOwnerController
);

treasuryRouter.post(
  "/:merchantId/owners/:teamMemberId/remove",
  requireMerchantKybApproved("updating treasury approvers in live mode"),
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  removeTreasuryOwnerController
);

treasuryRouter.post(
  "/:merchantId/threshold",
  requireMerchantKybApproved("updating treasury approval threshold in live mode"),
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  updateTreasuryThresholdController
);

treasuryRouter.get(
  "/operations/:operationId/signing-payload",
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  getTreasuryOperationSigningPayloadController
);

treasuryRouter.post(
  "/operations/:operationId/approve",
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  approveTreasuryOperationController
);

treasuryRouter.post(
  "/operations/:operationId/reject",
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  rejectTreasuryOperationController
);

treasuryRouter.post(
  "/operations/:operationId/execute",
  requirePlatformRoles(["owner"]),
  requirePlatformPermissions(["treasury", "team_admin"]),
  executeTreasuryOperationController
);

export { treasuryRouter };
