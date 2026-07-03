import { z } from "zod";

import { optionalPaginationQuerySchema } from "@/shared/utils/pagination";
import { isEvmAddress } from "@/shared/constants/address";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

const settlementStatusSchema = z.enum(["active", "disabled"]);

const accountBaseSchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
  accountCode: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  name: z.string().trim().min(2).max(120),
  assetSymbol: z.literal("USDC").default("USDC"),
  destinationAddress: z.string().trim().min(1).nullable().optional(),
  isDefault: z.boolean().default(false),
  status: settlementStatusSchema.default("active"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function validateAccountShape(
  input: z.infer<typeof accountBaseSchema>,
  ctx: z.RefinementCtx
) {
  if (!input.destinationAddress) {
    ctx.addIssue({
      code: "custom",
      path: ["destinationAddress"],
      message: "A payout wallet is required.",
    });
  }

  if (
    input.destinationAddress &&
    !isEvmAddress(input.destinationAddress)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["destinationAddress"],
      message: "Payout wallet must be a valid wallet address.",
    });
  }
}

export const createSettlementAccountSchema =
  accountBaseSchema.superRefine(validateAccountShape);

export const listSettlementAccountsQuerySchema = z
  .object({
    merchantId: objectIdSchema.optional(),
    environment: environmentInputSchema.optional(),
    status: settlementStatusSchema.optional(),
    search: z.string().trim().min(1).optional(),
  })
  .merge(optionalPaginationQuerySchema);

export const settlementAssetCatalogQuerySchema = z.object({
  merchantId: objectIdSchema.optional(),
  environment: environmentInputSchema.optional(),
});

export const updateSettlementAccountSchema = accountBaseSchema
  .omit({ merchantId: true, environment: true })
  .partial()
  .superRefine((input, ctx) => {
    if (
      input.destinationAddress &&
      !isEvmAddress(input.destinationAddress)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationAddress"],
        message: "Payout wallet must be a valid wallet address.",
      });
    }
  });

export const settlementAccountParamSchema = z.object({
  accountId: objectIdSchema,
});

export type CreateSettlementAccountInput = z.infer<
  typeof createSettlementAccountSchema
>;
export type ListSettlementAccountsQuery = z.infer<
  typeof listSettlementAccountsQuerySchema
>;
export type SettlementAssetCatalogQuery = z.infer<
  typeof settlementAssetCatalogQuerySchema
>;
export type UpdateSettlementAccountInput = z.infer<
  typeof updateSettlementAccountSchema
>;
