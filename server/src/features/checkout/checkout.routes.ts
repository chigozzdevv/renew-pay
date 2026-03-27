import { Router } from "express";

import {
  completeCheckoutTestPaymentController,
  createCheckoutSessionController,
  createWorkspaceCheckoutSessionController,
  getCheckoutSessionController,
  listCheckoutPlansController,
  listWorkspaceCheckoutPlansController,
  quoteCheckoutSessionMarketController,
  submitCheckoutCustomerController,
} from "@/features/checkout/checkout.controller";
import { requireCheckoutSessionAuth } from "@/shared/middleware/checkout-session-auth";
import { requireDeveloperKeyAuth } from "@/shared/middleware/developer-key-auth";
import {
  requirePlatformAuth,
  requirePlatformPermissions,
} from "@/shared/middleware/platform-auth";

const checkoutRouter = Router();

checkoutRouter.get(
  "/playground/plans",
  requirePlatformAuth,
  requirePlatformPermissions(["plans", "subscriptions", "payments"]),
  listWorkspaceCheckoutPlansController
);
checkoutRouter.post(
  "/playground/sessions",
  requirePlatformAuth,
  requirePlatformPermissions(["plans", "subscriptions", "payments"]),
  createWorkspaceCheckoutSessionController
);
checkoutRouter.get("/plans", requireDeveloperKeyAuth, listCheckoutPlansController);
checkoutRouter.post("/sessions", requireDeveloperKeyAuth, createCheckoutSessionController);
checkoutRouter.get(
  "/sessions/:sessionId",
  requireCheckoutSessionAuth,
  getCheckoutSessionController
);
checkoutRouter.get(
  "/sessions/:sessionId/quote",
  requireCheckoutSessionAuth,
  quoteCheckoutSessionMarketController
);
checkoutRouter.post(
  "/sessions/:sessionId/customer",
  requireCheckoutSessionAuth,
  submitCheckoutCustomerController
);
checkoutRouter.post(
  "/sessions/:sessionId/test-complete",
  requireCheckoutSessionAuth,
  completeCheckoutTestPaymentController
);

export { checkoutRouter };
