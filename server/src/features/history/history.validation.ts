import { z } from "zod";

import { optionalPaginationQuerySchema } from "@/shared/utils/pagination";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

export const historyTypeSchema = z.enum([
  "payment",
  "payout",
  "customer",
  "developer_event",
  "workspace_event",
]);

export const listHistoryQuerySchema = z
  .object({
    merchantId: objectIdSchema,
    environment: environmentInputSchema.optional(),
    type: historyTypeSchema.optional(),
    status: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
  })
  .merge(optionalPaginationQuerySchema);

export type ListHistoryQuery = z.infer<typeof listHistoryQuerySchema>;
export type HistoryType = z.infer<typeof historyTypeSchema>;
