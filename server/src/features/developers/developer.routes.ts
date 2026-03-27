import { Router } from "express";

import {
  createDeveloperKeyController,
  createTestDeliveryController,
  createWebhookController,
  listDeliveriesController,
  listDeveloperKeysController,
  listWebhooksController,
  revokeDeveloperKeyController,
  rotateWebhookSecretController,
  updateWebhookController,
} from "@/features/developers/developer.controller";

const developerRouter = Router();

developerRouter.get("/keys", listDeveloperKeysController);
developerRouter.post("/keys", createDeveloperKeyController);
developerRouter.post("/keys/:developerKeyId/revoke", revokeDeveloperKeyController);

developerRouter.get("/webhooks", listWebhooksController);
developerRouter.post("/webhooks", createWebhookController);
developerRouter.patch("/webhooks/:webhookId", updateWebhookController);
developerRouter.post(
  "/webhooks/:webhookId/rotate-secret",
  rotateWebhookSecretController
);
developerRouter.post("/webhooks/:webhookId/test", createTestDeliveryController);

developerRouter.get("/deliveries", listDeliveriesController);

export { developerRouter };
