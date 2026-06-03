import { Router } from "express";

import {
  createSettlementAccountController,
  getDefaultSettlementAccountController,
  getSettlementAccountController,
  listSettlementAssetsController,
  listSettlementAccountsController,
  updateSettlementAccountController,
} from "@/features/settlement/settlement.controller";
import { requireMerchantKybApproved } from "@/shared/middleware/merchant-kyb";

const settlementRouter = Router();

settlementRouter.get("/accounts", listSettlementAccountsController);
settlementRouter.get("/assets", listSettlementAssetsController);
settlementRouter.post(
  "/accounts",
  requireMerchantKybApproved("creating settlement accounts in live mode"),
  createSettlementAccountController
);
settlementRouter.get("/accounts/default", getDefaultSettlementAccountController);
settlementRouter.get("/accounts/:accountId", getSettlementAccountController);
settlementRouter.patch(
  "/accounts/:accountId",
  requireMerchantKybApproved("updating settlement accounts in live mode"),
  updateSettlementAccountController
);

export { settlementRouter };
