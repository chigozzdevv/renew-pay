import { z } from "zod";

import { isStellarAddress } from "@/shared/constants/stellar";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

const addressSchema = z
  .string()
  .trim()
  .refine(isStellarAddress, "Must be a valid Stellar address.");

const payoutStatusSchema = z.enum([
  "queued",
  "confirming",
  "held",
  "settled",
  "failed",
  "reversed",
]);
const payoutSourceKindSchema = z.enum(["payment"]);

export const createPayoutSchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
  sourcePaymentId: objectIdSchema.nullable().optional(),
  batchRef: z.string().trim().min(2).max(120),
  sourceKind: payoutSourceKindSchema.optional(),
  commercialRef: z.string().trim().min(2).max(120).nullable().optional(),
  localAmount: z.coerce.number().positive().nullable().optional(),
  fxRate: z.coerce.number().positive().nullable().optional(),
  grossUsdc: z.coerce.number().positive(),
  feeUsdc: z.coerce.number().nonnegative().default(0),
  netUsdc: z.coerce.number().positive(),
  destinationWallet: addressSchema,
  status: payoutStatusSchema.default("queued"),
  txHash: z.string().trim().min(1).nullable().optional(),
  bridgeSourceTxHash: z.string().trim().min(1).nullable().optional(),
  bridgeReceiveTxHash: z.string().trim().min(1).nullable().optional(),
  creditTxHash: z.string().trim().min(1).nullable().optional(),
  vaultBatchId: z.string().trim().min(1).nullable().optional(),
  vaultDepositTxHash: z.string().trim().min(1).nullable().optional(),
  vaultReleaseTxHash: z.string().trim().min(1).nullable().optional(),
  vaultHeldAt: z.coerce.date().nullable().optional(),
  submittedAt: z.coerce.date().nullable().optional(),
  bridgeAttestedAt: z.coerce.date().nullable().optional(),
  scheduledFor: z.coerce.date(),
  settledAt: z.coerce.date().nullable().optional(),
  reversedAt: z.coerce.date().nullable().optional(),
  reversalReason: z.string().trim().min(2).max(240).nullable().optional(),
}).superRefine((input, ctx) => {
  if (!input.sourcePaymentId) {
    ctx.addIssue({
      code: "custom",
      path: ["sourcePaymentId"],
      message: "Payouts require a source payment.",
    });
  }
});

export const listPayoutsQuerySchema = z.object({
  merchantId: objectIdSchema.optional(),
  environment: environmentInputSchema.optional(),
  status: payoutStatusSchema.optional(),
  search: z.string().trim().min(1).optional(),
});

export const updatePayoutSchema = z.object({
  sourceKind: payoutSourceKindSchema.optional(),
  commercialRef: z.string().trim().min(2).max(120).nullable().optional(),
  localAmount: z.coerce.number().positive().nullable().optional(),
  fxRate: z.coerce.number().positive().nullable().optional(),
  status: payoutStatusSchema.optional(),
  txHash: z.string().trim().min(1).nullable().optional(),
  bridgeSourceTxHash: z.string().trim().min(1).nullable().optional(),
  bridgeReceiveTxHash: z.string().trim().min(1).nullable().optional(),
  creditTxHash: z.string().trim().min(1).nullable().optional(),
  vaultBatchId: z.string().trim().min(1).nullable().optional(),
  vaultDepositTxHash: z.string().trim().min(1).nullable().optional(),
  vaultReleaseTxHash: z.string().trim().min(1).nullable().optional(),
  vaultHeldAt: z.coerce.date().nullable().optional(),
  submittedAt: z.coerce.date().nullable().optional(),
  bridgeAttestedAt: z.coerce.date().nullable().optional(),
  sourcePaymentId: objectIdSchema.nullable().optional(),
  settledAt: z.coerce.date().nullable().optional(),
  reversedAt: z.coerce.date().nullable().optional(),
  reversalReason: z.string().trim().min(2).max(240).nullable().optional(),
  scheduledFor: z.coerce.date().optional(),
});

export const payoutParamSchema = z.object({
  payoutId: objectIdSchema,
});

export type CreatePayoutInput = z.infer<typeof createPayoutSchema>;
export type ListPayoutsQuery = z.infer<typeof listPayoutsQuerySchema>;
export type UpdatePayoutInput = z.infer<typeof updatePayoutSchema>;
