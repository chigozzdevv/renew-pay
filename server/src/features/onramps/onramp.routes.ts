import { Router } from "express";

import {
  createWidgetQuoteController,
  enqueueOnrampSyncController,
  listChannelsController,
  listNetworksController,
  processPartnaWebhookController,
  syncChannelsController,
  syncNetworksController,
} from "@/features/onramps/onramp.controller";
import {
  requirePlatformAuth,
  requirePlatformPermissions,
} from "@/shared/middleware/platform-auth";

const onrampRouter = Router();

onrampRouter.post("/webhooks/partna", processPartnaWebhookController);

onrampRouter.use(requirePlatformAuth);
onrampRouter.use(
  requirePlatformPermissions(["payments", "developers", "settings"])
);

onrampRouter.get("/channels", listChannelsController);
onrampRouter.post(
  "/channels/sync",
  requirePlatformPermissions(["developers", "settings"]),
  syncChannelsController
);
onrampRouter.get("/networks", listNetworksController);
onrampRouter.post(
  "/networks/sync",
  requirePlatformPermissions(["developers", "settings"]),
  syncNetworksController
);
onrampRouter.post(
  "/sync",
  requirePlatformPermissions(["developers", "settings"]),
  enqueueOnrampSyncController
);
onrampRouter.post("/quotes", createWidgetQuoteController);

export { onrampRouter };
