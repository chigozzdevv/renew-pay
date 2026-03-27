import { Router } from "express";

import {
  createSettlementController,
  getSettlementController,
  listSettlementsController,
  updateSettlementController,
} from "@/features/settlements/settlement.controller";
import { requireMerchantKybApproved } from "@/shared/middleware/merchant-kyb";

const settlementRouter = Router();

settlementRouter.get("/", listSettlementsController);
settlementRouter.post(
  "/",
  requireMerchantKybApproved("creating settlements in live mode"),
  createSettlementController
);
settlementRouter.get("/:settlementId", getSettlementController);
settlementRouter.patch(
  "/:settlementId",
  requireMerchantKybApproved("updating settlements in live mode"),
  updateSettlementController
);

export { settlementRouter };
