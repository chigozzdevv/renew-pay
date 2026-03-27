import { z } from "zod";

import { notificationTemplateKeys } from "@/features/notifications/notification.template";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

export const notificationMerchantParamSchema = z.object({
  merchantId: objectIdSchema,
});

export const notificationTemplateParamSchema = z.object({
  merchantId: objectIdSchema,
  templateKey: z.enum(notificationTemplateKeys),
});

export const notificationPreviewQuerySchema = z.object({
  environment: environmentInputSchema.default("test"),
});

export type NotificationPreviewQuery = z.infer<
  typeof notificationPreviewQuerySchema
>;

