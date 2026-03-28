import { Router } from "express";

import {
  handleResendInboundWebhookController,
  listNotificationTemplatesController,
  previewNotificationTemplateController,
} from "@/features/notifications/notification.controller";
import {
  requirePlatformAuth,
  requirePlatformPermissions,
  requirePlatformRoles,
} from "@/shared/middleware/platform-auth";

const notificationRouter = Router();

notificationRouter.post(
  "/webhooks/resend/inbound",
  handleResendInboundWebhookController
);

notificationRouter.use(requirePlatformAuth);

notificationRouter.get(
  "/:merchantId/templates",
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["team_admin"]),
  listNotificationTemplatesController
);
notificationRouter.get(
  "/:merchantId/templates/:templateKey/preview",
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["team_admin"]),
  previewNotificationTemplateController
);

export { notificationRouter };
