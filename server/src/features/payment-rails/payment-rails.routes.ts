import { Router } from "express";

import {
  acceptCollectionRequestController,
  createWidgetQuoteController,
  denyCollectionRequestController,
  enqueuePaymentRailSyncController,
  getCollectionRequestController,
  listChannelsController,
  listNetworksController,
  processYellowCardWebhookController,
  resolveBankAccountController,
  syncChannelsController,
  syncNetworksController,
} from "@/features/payment-rails/payment-rails.controller";
import {
  requirePlatformAuth,
  requirePlatformPermissions,
} from "@/shared/middleware/platform-auth";

const paymentRailRouter = Router();

paymentRailRouter.post("/webhooks/yellow-card", processYellowCardWebhookController);

paymentRailRouter.use(requirePlatformAuth);
paymentRailRouter.use(
  requirePlatformPermissions(["payments", "treasury", "developers", "team_admin"])
);

paymentRailRouter.get("/channels", listChannelsController);
paymentRailRouter.post(
  "/channels/sync",
  requirePlatformPermissions(["developers", "team_admin"]),
  syncChannelsController
);
paymentRailRouter.get("/networks", listNetworksController);
paymentRailRouter.post(
  "/networks/sync",
  requirePlatformPermissions(["developers", "team_admin"]),
  syncNetworksController
);
paymentRailRouter.post(
  "/sync",
  requirePlatformPermissions(["developers", "team_admin"]),
  enqueuePaymentRailSyncController
);
paymentRailRouter.post("/quotes", createWidgetQuoteController);
paymentRailRouter.post("/banks/resolve", resolveBankAccountController);
paymentRailRouter.get("/collections/:collectionId", getCollectionRequestController);
paymentRailRouter.post("/collections/:collectionId/accept", acceptCollectionRequestController);
paymentRailRouter.post("/collections/:collectionId/deny", denyCollectionRequestController);

export { paymentRailRouter };
