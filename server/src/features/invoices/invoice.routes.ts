import { Router } from "express";

import {
  completePublicInvoiceTestPaymentController,
  createInvoiceController,
  getInvoiceController,
  getPublicInvoiceController,
  listInvoicesController,
  remindInvoiceController,
  sendInvoiceController,
  startPublicInvoicePaymentController,
  submitPublicInvoiceVerificationController,
  updateInvoiceController,
  voidInvoiceController,
} from "@/features/invoices/invoice.controller";

const invoiceRouter = Router();
const publicInvoiceRouter = Router();

invoiceRouter.get("/", listInvoicesController);
invoiceRouter.post("/", createInvoiceController);
invoiceRouter.get("/:invoiceId", getInvoiceController);
invoiceRouter.patch("/:invoiceId", updateInvoiceController);
invoiceRouter.post("/:invoiceId/send", sendInvoiceController);
invoiceRouter.post("/:invoiceId/remind", remindInvoiceController);
invoiceRouter.post("/:invoiceId/void", voidInvoiceController);

publicInvoiceRouter.get("/:publicToken", getPublicInvoiceController);
publicInvoiceRouter.post("/:publicToken/start-payment", startPublicInvoicePaymentController);
publicInvoiceRouter.post(
  "/:publicToken/submit-verification",
  submitPublicInvoiceVerificationController
);
publicInvoiceRouter.post(
  "/:publicToken/test-complete-payment",
  completePublicInvoiceTestPaymentController
);

export { invoiceRouter, publicInvoiceRouter };
