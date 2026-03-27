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

export const teamMemberKycParamSchema = z.object({
  teamMemberId: objectIdSchema,
});

export const startMerchantKybSchema = z.object({
  merchantId: objectIdSchema,
  actor: z.string().trim().min(2).max(120).default("system"),
  environment: environmentInputSchema.default("test"),
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

export const startTeamMemberKycSchema = z.object({
  merchantId: objectIdSchema,
  teamMemberId: objectIdSchema,
  actor: z.string().trim().min(2).max(120).default("system"),
  environment: environmentInputSchema.default("test"),
  levelName: z.string().trim().min(2).max(120).optional(),
  country: countrySchema.optional(),
  lang: z.string().trim().min(2).max(10).optional(),
});

export const syncTeamMemberKycSchema = z.object({
  merchantId: objectIdSchema,
  teamMemberId: objectIdSchema,
  actor: z.string().trim().min(2).max(120).default("system"),
  environment: environmentInputSchema.default("test"),
});

export const merchantKybStatusQuerySchema = z.object({
  merchantId: objectIdSchema,
  environment: optionalEnvironmentInputSchema,
});

export const teamMemberKycStatusQuerySchema = z.object({
  merchantId: objectIdSchema,
  teamMemberId: objectIdSchema,
  environment: optionalEnvironmentInputSchema,
});

export const sumsubWebhookSchema = z
  .object({
    environment: optionalEnvironmentInputSchema,
    type: z.string().trim().min(1).default("unknown"),
    applicantId: z.string().trim().min(1).optional(),
    externalUserId: z.string().trim().min(1).optional(),
    reviewStatus: z.string().trim().min(1).optional(),
    reviewResult: z
      .object({
        reviewAnswer: z.string().trim().min(1).optional(),
        reviewRejectType: z.string().trim().min(1).optional(),
        rejectLabels: z.array(z.string().trim().min(1)).optional(),
        moderationComment: z.string().trim().min(1).optional(),
        clientComment: z.string().trim().min(1).optional(),
      })
      .partial()
      .passthrough()
      .optional(),
  })
  .passthrough();

export type StartMerchantKybInput = z.infer<typeof startMerchantKybSchema>;
export type SyncMerchantKybInput = z.infer<typeof syncMerchantKybSchema>;
export type StartTeamMemberKycInput = z.infer<typeof startTeamMemberKycSchema>;
export type SyncTeamMemberKycInput = z.infer<typeof syncTeamMemberKycSchema>;
export type MerchantKybStatusQuery = z.infer<typeof merchantKybStatusQuerySchema>;
export type TeamMemberKycStatusQuery = z.infer<typeof teamMemberKycStatusQuerySchema>;
export type SumsubWebhookInput = z.infer<typeof sumsubWebhookSchema>;
