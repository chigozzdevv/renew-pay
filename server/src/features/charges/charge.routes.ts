import { Router } from "express";

import {
  createChargeController,
  getChargeController,
  listChargesController,
  retryChargeController,
  updateChargeController,
} from "@/features/charges/charge.controller";
import { requireMerchantKybApproved } from "@/shared/middleware/merchant-kyb";

const chargeRouter = Router();

chargeRouter.get("/", listChargesController);
chargeRouter.post(
  "/",
  requireMerchantKybApproved("creating charges in live mode"),
  createChargeController
);
chargeRouter.get("/:chargeId", getChargeController);
chargeRouter.patch("/:chargeId", updateChargeController);
chargeRouter.post(
  "/:chargeId/retry",
  requireMerchantKybApproved("retrying charges in live mode"),
  retryChargeController
);

export { chargeRouter };
