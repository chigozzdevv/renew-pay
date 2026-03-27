import { Router } from "express";

import {
  listNotificationTemplatesController,
  previewNotificationTemplateController,
} from "@/features/notifications/notification.controller";
import {
  requirePlatformPermissions,
  requirePlatformRoles,
} from "@/shared/middleware/platform-auth";

const notificationRouter = Router();

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

