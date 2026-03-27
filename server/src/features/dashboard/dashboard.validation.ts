import { z } from "zod";

import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

export const dashboardOverviewQuerySchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
});

export const dashboardMarketCatalogQuerySchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
});

export const dashboardMarketQuoteQuerySchema = z.object({
  merchantId: objectIdSchema,
  planId: objectIdSchema,
  currency: z.string().trim().min(2).max(8).toUpperCase(),
  environment: environmentInputSchema.default("test"),
});

export type DashboardOverviewQuery = z.infer<typeof dashboardOverviewQuerySchema>;
export type DashboardMarketCatalogQuery = z.infer<typeof dashboardMarketCatalogQuerySchema>;
export type DashboardMarketQuoteQuery = z.infer<typeof dashboardMarketQuoteQuerySchema>;
