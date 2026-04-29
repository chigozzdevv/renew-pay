import { Router } from "express";

import {
  createPaymentController,
  getPaymentController,
  listPaymentsController,
  updatePaymentController,
} from "@/features/payments/payment.controller";
import { requireMerchantKybApproved } from "@/shared/middleware/merchant-kyb";

const paymentRouter = Router();

paymentRouter.get("/", listPaymentsController);
paymentRouter.post(
  "/",
  requireMerchantKybApproved("creating payments in live mode"),
  createPaymentController
);
paymentRouter.get("/:paymentId", getPaymentController);
paymentRouter.patch(
  "/:paymentId",
  requireMerchantKybApproved("updating payments in live mode"),
  updatePaymentController
);

export { paymentRouter };
