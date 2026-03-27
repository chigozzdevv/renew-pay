import { z } from "zod";

import { optionalPaginationQuerySchema } from "@/shared/utils/pagination";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const marketSchema = z.string().trim().min(2).max(8).toUpperCase();

export const createPlanSchema = z.object({
  merchantId: z.string().trim().min(1),
  environment: environmentInputSchema.default("test"),
  planCode: z.string().trim().min(2).max(48).toUpperCase(),
  name: z.string().trim().min(2).max(120),
  usdAmount: z.coerce.number().positive(),
  usageRate: z.coerce.number().nonnegative().nullable().optional(),
  billingIntervalDays: z.coerce.number().int().positive(),
  trialDays: z.coerce.number().int().nonnegative().default(0),
  retryWindowHours: z.coerce.number().int().nonnegative().default(24),
  billingMode: z.enum(["fixed", "metered"]),
  supportedMarkets: z.array(marketSchema).min(1),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
});

export const listPlansQuerySchema = z
  .object({
    merchantId: z.string().trim().min(1).optional(),
    environment: environmentInputSchema.optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
    search: z.string().trim().min(1).optional(),
  })
  .merge(optionalPaginationQuerySchema);

export const updatePlanSchema = createPlanSchema
  .omit({ merchantId: true, environment: true })
  .partial();

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
