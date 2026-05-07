import { Router } from "express";

import {
  cancelCollectionController,
  confirmPublicCheckoutOtpController,
  confirmPublicCheckoutPhoneController,
  createCollectionController,
  createPaymentController,
  getCollectionController,
  getPaymentController,
  getPublicPaymentController,
  listCollectionsController,
  listPaymentsController,
  selectPublicCheckoutKycMethodController,
  startPublicCheckoutKycController,
  startPublicPaymentController,
  submitPublicCheckoutCustomerController,
  updatePaymentController,
} from "@/features/payments/payment.controller";
import { requireMerchantKybApproved } from "@/shared/middleware/merchant-kyb";

const paymentRouter = Router();
const collectionRouter = Router();
const publicPaymentRouter = Router();

publicPaymentRouter.get("/:payId", getPublicPaymentController);
publicPaymentRouter.post("/:payId/customer", submitPublicCheckoutCustomerController);
publicPaymentRouter.post("/:payId/kyc/bvn", startPublicCheckoutKycController);
publicPaymentRouter.post("/:payId/kyc/method", selectPublicCheckoutKycMethodController);
publicPaymentRouter.post("/:payId/kyc/phone", confirmPublicCheckoutPhoneController);
publicPaymentRouter.post("/:payId/kyc/otp", confirmPublicCheckoutOtpController);
publicPaymentRouter.post("/:payId/start", startPublicPaymentController);

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

collectionRouter.get("/", listCollectionsController);
collectionRouter.post(
  "/",
  requireMerchantKybApproved("creating collections in live mode"),
  createCollectionController
);
collectionRouter.get("/:collectionId", getCollectionController);
collectionRouter.post(
  "/:collectionId/cancel",
  requireMerchantKybApproved("cancelling collections in live mode"),
  cancelCollectionController
);

export { collectionRouter, paymentRouter, publicPaymentRouter };
