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

const settlementStatusSchema = z.enum([
  "queued",
  "confirming",
  "settled",
  "failed",
  "reversed",
]);
const settlementSourceKindSchema = z.enum(["subscription", "invoice"]);

export const createSettlementSchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
  sourceChargeId: objectIdSchema.nullable().optional(),
  batchRef: z.string().trim().min(2).max(120),
  sourceKind: settlementSourceKindSchema.optional(),
  commercialRef: z.string().trim().min(2).max(120).nullable().optional(),
  localAmount: z.coerce.number().positive().nullable().optional(),
  fxRate: z.coerce.number().positive().nullable().optional(),
  grossUsdc: z.coerce.number().positive(),
  feeUsdc: z.coerce.number().nonnegative().default(0),
  netUsdc: z.coerce.number().positive(),
  destinationWallet: addressSchema,
  status: settlementStatusSchema.default("queued"),
  txHash: z.string().trim().min(1).nullable().optional(),
  bridgeSourceTxHash: z.string().trim().min(1).nullable().optional(),
  bridgeReceiveTxHash: z.string().trim().min(1).nullable().optional(),
  creditTxHash: z.string().trim().min(1).nullable().optional(),
  protocolExecutionKind: z
    .enum(["subscription_charge_success", "invoice_settlement"])
    .nullable()
    .optional(),
  protocolAmountUsdc: z.coerce.number().positive().nullable().optional(),
  protocolChargeId: z.string().trim().min(1).nullable().optional(),
  submittedAt: z.coerce.date().nullable().optional(),
  bridgeAttestedAt: z.coerce.date().nullable().optional(),
  scheduledFor: z.coerce.date(),
  settledAt: z.coerce.date().nullable().optional(),
  reversedAt: z.coerce.date().nullable().optional(),
  reversalReason: z.string().trim().min(2).max(240).nullable().optional(),
}).superRefine((input, ctx) => {
  if (input.sourceChargeId) {
    return;
  }

  if (input.sourceKind !== "invoice") {
    ctx.addIssue({
      code: "custom",
      path: ["sourceKind"],
      message: "Invoice settlements must declare sourceKind as invoice.",
    });
  }

  if (!input.commercialRef) {
    ctx.addIssue({
      code: "custom",
      path: ["commercialRef"],
      message: "Invoice settlements require a commercial reference.",
    });
  }

  if (!Number.isFinite(input.localAmount ?? NaN) || (input.localAmount ?? 0) <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["localAmount"],
      message: "Invoice settlements require a valid local amount.",
    });
  }

  if (!Number.isFinite(input.fxRate ?? NaN) || (input.fxRate ?? 0) <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["fxRate"],
      message: "Invoice settlements require a valid FX rate.",
    });
  }
});

export const listSettlementsQuerySchema = z.object({
  merchantId: objectIdSchema.optional(),
  environment: environmentInputSchema.optional(),
  status: settlementStatusSchema.optional(),
  search: z.string().trim().min(1).optional(),
});

export const updateSettlementSchema = z.object({
  sourceKind: settlementSourceKindSchema.optional(),
  commercialRef: z.string().trim().min(2).max(120).nullable().optional(),
  localAmount: z.coerce.number().positive().nullable().optional(),
  fxRate: z.coerce.number().positive().nullable().optional(),
  status: settlementStatusSchema.optional(),
  txHash: z.string().trim().min(1).nullable().optional(),
  bridgeSourceTxHash: z.string().trim().min(1).nullable().optional(),
  bridgeReceiveTxHash: z.string().trim().min(1).nullable().optional(),
  creditTxHash: z.string().trim().min(1).nullable().optional(),
  protocolExecutionKind: z
    .enum(["subscription_charge_success", "invoice_settlement"])
    .nullable()
    .optional(),
  protocolAmountUsdc: z.coerce.number().positive().nullable().optional(),
  protocolChargeId: z.string().trim().min(1).nullable().optional(),
  submittedAt: z.coerce.date().nullable().optional(),
  bridgeAttestedAt: z.coerce.date().nullable().optional(),
  sourceChargeId: objectIdSchema.nullable().optional(),
  settledAt: z.coerce.date().nullable().optional(),
  reversedAt: z.coerce.date().nullable().optional(),
  reversalReason: z.string().trim().min(2).max(240).nullable().optional(),
  scheduledFor: z.coerce.date().optional(),
});

export const settlementParamSchema = z.object({
  settlementId: objectIdSchema,
});

export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
export type ListSettlementsQuery = z.infer<typeof listSettlementsQuerySchema>;
export type UpdateSettlementInput = z.infer<typeof updateSettlementSchema>;
