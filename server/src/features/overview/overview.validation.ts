import { z } from "zod";

import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

export const overviewQuerySchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
});

export const overviewMarketCatalogQuerySchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
});

export const overviewMarketQuoteQuerySchema = z.object({
  merchantId: objectIdSchema,
  currency: z.string().trim().min(2).max(8).toUpperCase(),
  amount: z.coerce.number().positive(),
  environment: environmentInputSchema.default("test"),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type OverviewMarketCatalogQuery = z.infer<
  typeof overviewMarketCatalogQuerySchema
>;
export type OverviewMarketQuoteQuery = z.infer<typeof overviewMarketQuoteQuerySchema>;
