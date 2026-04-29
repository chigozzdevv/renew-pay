import { Router } from "express";

import {
  createSettlementRouteController,
  getDefaultSettlementRouteController,
  getSettlementRouteController,
  listSettlementRoutesController,
  updateSettlementRouteController,
} from "@/features/settlement/settlement.controller";
import { requireMerchantKybApproved } from "@/shared/middleware/merchant-kyb";

const settlementRouter = Router();

settlementRouter.get("/routes", listSettlementRoutesController);
settlementRouter.post(
  "/routes",
  requireMerchantKybApproved("creating settlement routes in live mode"),
  createSettlementRouteController
);
settlementRouter.get("/routes/default", getDefaultSettlementRouteController);
settlementRouter.get("/routes/:routeId", getSettlementRouteController);
settlementRouter.patch(
  "/routes/:routeId",
  requireMerchantKybApproved("updating settlement routes in live mode"),
  updateSettlementRouteController
);

export { settlementRouter };
