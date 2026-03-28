import type { Request, Response } from "express";

import {
  handleResendInboundWebhook,
  listNotificationTemplates,
  previewNotificationTemplate,
} from "@/features/notifications/notification.service";
import {
  notificationMerchantParamSchema,
  notificationPreviewQuerySchema,
  notificationTemplateParamSchema,
} from "@/features/notifications/notification.validation";
import { asyncHandler } from "@/shared/utils/async-handler";

export const handleResendInboundWebhookController = asyncHandler(
  async (request: Request, response: Response) => {
    const result = await handleResendInboundWebhook({
      rawBody: request.rawBody ?? JSON.stringify(request.body ?? {}),
      svixId: request.header("svix-id") ?? null,
      svixTimestamp: request.header("svix-timestamp") ?? null,
      svixSignature: request.header("svix-signature") ?? null,
    });

    response.status(200).json({
      success: true,
      data: result,
    });
  }
);

export const listNotificationTemplatesController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = notificationMerchantParamSchema.parse(request.params);
    const query = notificationPreviewQuerySchema.parse(request.query);

    response.status(200).json({
      success: true,
      data: await listNotificationTemplates(params.merchantId, query.environment),
    });
  }
);

export const previewNotificationTemplateController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = notificationTemplateParamSchema.parse(request.params);
    const query = notificationPreviewQuerySchema.parse(request.query);

    response.status(200).json({
      success: true,
      data: await previewNotificationTemplate({
        merchantId: params.merchantId,
        templateKey: params.templateKey,
        environment: query.environment,
      }),
    });
  }
);
