import { z } from "zod";

import {
  environmentInputSchema,
  optionalEnvironmentInputSchema,
} from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Country must be a valid ISO-2 code.");

export const merchantKybParamSchema = z.object({
  merchantId: objectIdSchema,
});

export const startMerchantKybSchema = z.object({
  merchantId: objectIdSchema,
  actor: z.string().trim().min(2).max(120).default("system"),
  environment: environmentInputSchema.default("test"),
  workflowId: z.string().trim().min(2).max(120).optional(),
  levelName: z.string().trim().min(2).max(120).optional(),
  companyName: z.string().trim().min(2).max(180).optional(),
  registrationNumber: z.string().trim().min(2).max(120).optional(),
  country: countrySchema.optional(),
  taxId: z.string().trim().min(2).max(120).optional(),
  lang: z.string().trim().min(2).max(10).optional(),
});

export const syncMerchantKybSchema = z.object({
  merchantId: objectIdSchema,
  actor: z.string().trim().min(2).max(120).default("system"),
  environment: environmentInputSchema.default("test"),
});

export const startOwnerKycSchema = z.object({
  merchantId: objectIdSchema,
  actor: z.string().trim().min(2).max(120).default("system"),
  environment: environmentInputSchema.default("test"),
  workflowId: z.string().trim().min(2).max(120).optional(),
  levelName: z.string().trim().min(2).max(120).optional(),
  country: countrySchema.optional(),
  lang: z.string().trim().min(2).max(10).optional(),
});

export const syncOwnerKycSchema = z.object({
  merchantId: objectIdSchema,
  actor: z.string().trim().min(2).max(120).default("system"),
  environment: environmentInputSchema.default("test"),
});

export const merchantKybStatusQuerySchema = z.object({
  merchantId: objectIdSchema,
  environment: optionalEnvironmentInputSchema,
});

export const ownerKycStatusQuerySchema = z.object({
  merchantId: objectIdSchema,
  environment: optionalEnvironmentInputSchema,
});

export const diditWebhookSchema = z
  .object({
    environment: optionalEnvironmentInputSchema,
    event_id: z.string().trim().min(1).optional(),
    webhook_type: z.string().trim().min(1).optional(),
    type: z.string().trim().min(1).optional(),
    session_id: z.string().trim().min(1).optional(),
    vendor_data: z.string().trim().min(1).optional(),
    vendor_user_id: z.string().trim().min(1).optional(),
    externalUserId: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    previous_status: z.string().trim().min(1).optional(),
    decision: z.record(z.string(), z.unknown()).optional(),
    resubmit_info: z.record(z.string(), z.unknown()).optional(),
    rejectLabels: z.array(z.string().trim().min(1)).optional(),
    comment: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .passthrough();

export type StartMerchantKybInput = z.infer<typeof startMerchantKybSchema>;
export type SyncMerchantKybInput = z.infer<typeof syncMerchantKybSchema>;
export type StartOwnerKycInput = z.infer<typeof startOwnerKycSchema>;
export type SyncOwnerKycInput = z.infer<typeof syncOwnerKycSchema>;
export type MerchantKybStatusQuery = z.infer<typeof merchantKybStatusQuerySchema>;
export type OwnerKycStatusQuery = z.infer<typeof ownerKycStatusQuerySchema>;
export type DiditWebhookInput = z.infer<typeof diditWebhookSchema>;
