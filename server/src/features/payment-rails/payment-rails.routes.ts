import { Router } from "express";

import {
  createWidgetQuoteController,
  enqueuePaymentRailSyncController,
  listChannelsController,
  listNetworksController,
  processPartnaWebhookController,
  syncChannelsController,
  syncNetworksController,
} from "@/features/payment-rails/payment-rails.controller";
import {
  requirePlatformAuth,
  requirePlatformPermissions,
} from "@/shared/middleware/platform-auth";

const paymentRailRouter = Router();

paymentRailRouter.post("/webhooks/partna", processPartnaWebhookController);

paymentRailRouter.use(requirePlatformAuth);
paymentRailRouter.use(
  requirePlatformPermissions(["payments", "developers", "settings"])
);

paymentRailRouter.get("/channels", listChannelsController);
paymentRailRouter.post(
  "/channels/sync",
  requirePlatformPermissions(["developers", "settings"]),
  syncChannelsController
);
paymentRailRouter.get("/networks", listNetworksController);
paymentRailRouter.post(
  "/networks/sync",
  requirePlatformPermissions(["developers", "settings"]),
  syncNetworksController
);
paymentRailRouter.post(
  "/sync",
  requirePlatformPermissions(["developers", "settings"]),
  enqueuePaymentRailSyncController
);
paymentRailRouter.post("/quotes", createWidgetQuoteController);

export { paymentRailRouter };
