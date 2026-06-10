import { z } from "zod";

export const createPlaygroundCollectionSchema = z.object({
  useCase: z.enum(["ecommerce", "marketplace", "saas", "fintech"]).default("ecommerce"),
  variant: z.string().trim().min(1).max(80).optional(),
  market: z.enum(["NG", "GH", "KE"]).default("NG"),
  itemIds: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
});

export type CreatePlaygroundCollectionInput = z.infer<typeof createPlaygroundCollectionSchema>;
