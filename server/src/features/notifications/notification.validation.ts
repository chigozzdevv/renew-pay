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

export const resendWebhookEnvelopeSchema = z
  .object({
    type: z.string().trim().min(1),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

export const resendEmailReceivedWebhookSchema = z
  .object({
    type: z.literal("email.received"),
    data: z
      .object({
        email_id: z.string().trim().min(1),
        subject: z.string().trim().nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type NotificationPreviewQuery = z.infer<
  typeof notificationPreviewQuerySchema
>;
