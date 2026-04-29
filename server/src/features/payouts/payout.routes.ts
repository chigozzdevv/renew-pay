import { Router } from "express";

import {
  createPayoutController,
  getPayoutController,
  listPayoutsController,
  processPayoutController,
  updatePayoutController,
} from "@/features/payouts/payout.controller";
import { requireMerchantKybApproved } from "@/shared/middleware/merchant-kyb";

const payoutRouter = Router();

payoutRouter.get("/", listPayoutsController);
payoutRouter.post(
  "/",
  requireMerchantKybApproved("creating payouts in live mode"),
  createPayoutController
);
payoutRouter.get("/:payoutId", getPayoutController);
payoutRouter.patch(
  "/:payoutId",
  requireMerchantKybApproved("updating payouts in live mode"),
  updatePayoutController
);
payoutRouter.post(
  "/:payoutId/process",
  requireMerchantKybApproved("processing payouts in live mode"),
  processPayoutController
);

export { payoutRouter };
