import { z } from "zod";

import { isSolanaAddress } from "@/shared/constants/solana";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

const addressSchema = z
  .string()
  .trim()
  .refine(isSolanaAddress, "Must be a valid Solana address.");

export const treasuryMerchantParamSchema = z.object({
  merchantId: objectIdSchema,
});

export const payoutBatchQuerySchema = z.object({
  environment: environmentInputSchema.default("test"),
});

export const treasuryOperationParamSchema = z.object({
  operationId: objectIdSchema,
});

export const treasurySignerParamSchema = z.object({
  merchantId: objectIdSchema,
  teamMemberId: objectIdSchema,
});

export const createTreasurySignerChallengeSchema = z.object({
  walletAddress: addressSchema,
});

export const verifyTreasurySignerSchema = z.object({
  signature: z.string().trim().min(10).max(2048),
});

export const bootstrapTreasurySchema = z
  .object({
    environment: environmentInputSchema.default("test"),
    mode: z.enum(["create", "import"]),
    threshold: z.coerce.number().int().min(1).max(5).optional(),
    ownerTeamMemberIds: z.array(objectIdSchema).default([]),
    governanceMultisigAddress: addressSchema.optional(),
    governanceVaultAddress: addressSchema.optional(),
  })
  .superRefine((input, context) => {
    if (input.mode === "create") {
      if (input.ownerTeamMemberIds.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one verified approver is required to configure treasury governance.",
          path: ["ownerTeamMemberIds"],
        });
      }

      if (
        input.threshold !== undefined &&
        input.ownerTeamMemberIds.length > 0 &&
        input.threshold > input.ownerTeamMemberIds.length
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Threshold cannot exceed the number of selected owners.",
          path: ["threshold"],
        });
      }
    }

    if (
      input.mode === "import" &&
      !input.governanceMultisigAddress &&
      !input.governanceVaultAddress
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A governance multisig address is required when importing treasury custody.",
        path: ["governanceMultisigAddress"],
      });
    }
  });

export const approveTreasuryOperationSchema = z.object({
  signature: z.string().trim().min(10).max(2048),
});

export const rejectTreasuryOperationSchema = z.object({
  reason: z.string().trim().min(2).max(240),
});

export const addTreasuryOwnerSchema = z.object({
  environment: environmentInputSchema.default("test"),
  teamMemberId: objectIdSchema,
  threshold: z.coerce.number().int().min(1).max(10).optional(),
});

export const removeTreasuryOwnerSchema = z.object({
  environment: environmentInputSchema.default("test"),
  threshold: z.coerce.number().int().min(1).max(10).optional(),
});

export const updateTreasuryThresholdSchema = z.object({
  environment: environmentInputSchema.default("test"),
  threshold: z.coerce.number().int().min(1).max(10),
});

export const payoutBatchPreviewSchema = z.object({
  environment: environmentInputSchema.default("test"),
  trigger: z.enum(["manual", "scheduled", "threshold"]).default("manual"),
});

export const withdrawPayoutBatchSchema = z.object({
  environment: environmentInputSchema.default("test"),
  trigger: z.enum(["manual", "scheduled", "threshold"]).default("manual"),
});

export const payoutSettingsSchema = z.object({
  environment: environmentInputSchema.default("test"),
  payoutMode: z.enum(["manual", "automatic"]).default("manual"),
  autoPayoutFrequency: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
  autoPayoutTimeLocal: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, "Use HH:MM 24-hour format.")
    .optional(),
  thresholdPayoutEnabled: z.boolean().optional(),
  autoPayoutThresholdUsdc: z.coerce.number().min(0).nullable().optional(),
});

export type CreateTreasurySignerChallengeInput = z.infer<
  typeof createTreasurySignerChallengeSchema
>;
export type VerifyTreasurySignerInput = z.infer<
  typeof verifyTreasurySignerSchema
>;
export type BootstrapTreasuryInput = z.infer<typeof bootstrapTreasurySchema>;
export type ApproveTreasuryOperationInput = z.infer<
  typeof approveTreasuryOperationSchema
>;
export type RejectTreasuryOperationInput = z.infer<
  typeof rejectTreasuryOperationSchema
>;
export type AddTreasuryOwnerInput = z.infer<typeof addTreasuryOwnerSchema>;
export type RemoveTreasuryOwnerInput = z.infer<typeof removeTreasuryOwnerSchema>;
export type UpdateTreasuryThresholdInput = z.infer<
  typeof updateTreasuryThresholdSchema
>;
export type PayoutBatchQuery = z.infer<typeof payoutBatchQuerySchema>;
export type PayoutBatchPreviewInput = z.infer<typeof payoutBatchPreviewSchema>;
export type WithdrawPayoutBatchInput = z.infer<typeof withdrawPayoutBatchSchema>;
export type PayoutSettingsInput = z.infer<typeof payoutSettingsSchema>;
