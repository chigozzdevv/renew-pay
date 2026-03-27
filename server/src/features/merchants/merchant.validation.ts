import { z } from "zod";

import { isSolanaAddress } from "@/shared/constants/solana";

const addressSchema = z
  .string()
  .trim()
  .refine(isSolanaAddress, "Must be a valid Solana address.");

const marketSchema = z.string().trim().min(2).max(8).toUpperCase();

export const createMerchantSchema = z.object({
  merchantAccount: addressSchema,
  payoutWallet: addressSchema,
  reserveWallet: addressSchema.nullish().transform((value) => value ?? null),
  name: z.string().trim().min(2).max(120),
  supportEmail: z.email().trim().toLowerCase(),
  billingTimezone: z.string().trim().min(2).default("UTC"),
  supportedMarkets: z.array(marketSchema).min(1),
  metadataHash: z.string().trim().min(1).default("0x0"),
  status: z.enum(["active", "paused"]).default("active"),
});

export const listMerchantsQuerySchema = z.object({
  status: z.enum(["active", "paused"]).optional(),
  search: z.string().trim().min(1).optional(),
});

export const updateMerchantSchema = createMerchantSchema
  .omit({ merchantAccount: true })
  .partial();

export type CreateMerchantInput = z.infer<typeof createMerchantSchema>;
export type ListMerchantsQuery = z.infer<typeof listMerchantsQuerySchema>;
export type UpdateMerchantInput = z.infer<typeof updateMerchantSchema>;
