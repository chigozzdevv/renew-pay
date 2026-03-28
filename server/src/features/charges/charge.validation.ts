import { z } from "zod";

import { isSolanaAddress } from "@/shared/constants/solana";
import { optionalPaginationQuerySchema } from "@/shared/utils/pagination";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const addressSchema = z
  .string()
  .trim()
  .refine(isSolanaAddress, "Must be a valid Solana address.");

export const createChargeSchema = z.object({
  merchantId: z.string().trim().min(1),
  environment: environmentInputSchema.default("test"),
  sourceKind: z.enum(["subscription", "invoice"]).default("subscription"),
  subscriptionId: z.string().trim().min(1),
  externalChargeId: z.string().trim().min(2).max(120),
  settlementSource: addressSchema.nullish().transform((value) => value ?? null),
  localAmount: z.coerce.number().positive(),
  fxRate: z.coerce.number().positive(),
  usdcAmount: z.coerce.number().positive(),
  feeAmount: z.coerce.number().nonnegative().default(0),
  status: z
    .enum([
      "pending",
      "awaiting_settlement",
      "confirming",
      "settled",
      "failed",
      "reversed",
    ])
    .default("pending"),
  failureCode: z.string().trim().min(1).nullable().optional(),
  processedAt: z.coerce.date().optional(),
});

export const listChargesQuerySchema = z
  .object({
    merchantId: z.string().trim().min(1).optional(),
    environment: environmentInputSchema.optional(),
    sourceKind: z.enum(["subscription", "invoice"]).optional(),
    subscriptionId: z.string().trim().min(1).optional(),
    status: z
      .enum([
        "pending",
        "awaiting_settlement",
        "confirming",
        "settled",
        "failed",
        "reversed",
      ])
      .optional(),
    search: z.string().trim().min(1).optional(),
  })
  .merge(optionalPaginationQuerySchema);

export const updateChargeSchema = z.object({
  status: z
    .enum([
      "pending",
      "awaiting_settlement",
      "confirming",
      "settled",
      "failed",
      "reversed",
    ])
    .optional(),
  failureCode: z.string().trim().min(1).nullable().optional(),
  processedAt: z.coerce.date().optional(),
});

export type CreateChargeInput = z.infer<typeof createChargeSchema>;
export type ListChargesQuery = z.infer<typeof listChargesQuerySchema>;
export type UpdateChargeInput = z.infer<typeof updateChargeSchema>;
