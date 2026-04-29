import { Router } from "express";

import {
  handleResendInboundWebhookController,
  listNotificationTemplatesController,
  previewNotificationTemplateController,
} from "@/features/notifications/notification.controller";
import {
  requirePlatformAuth,
  requirePlatformPermissions,
} from "@/shared/middleware/platform-auth";

const notificationRouter = Router();

notificationRouter.post(
  "/webhooks/resend/inbound",
  handleResendInboundWebhookController
);

notificationRouter.use(requirePlatformAuth);

notificationRouter.get(
  "/:merchantId/templates",
  requirePlatformPermissions(["settings"]),
  listNotificationTemplatesController
);
notificationRouter.get(
  "/:merchantId/templates/:templateKey/preview",
  requirePlatformPermissions(["settings"]),
  previewNotificationTemplateController
);

export { notificationRouter };
