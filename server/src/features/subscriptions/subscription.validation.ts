import { z } from "zod";

import { optionalPaginationQuerySchema } from "@/shared/utils/pagination";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

export const createSubscriptionSchema = z.object({
  merchantId: z.string().trim().min(1),
  environment: environmentInputSchema.default("test"),
  planId: z.string().trim().min(1),
  customerRef: z.string().trim().min(2).max(120),
  customerName: z.string().trim().min(2).max(120),
  billingCurrency: z.string().trim().min(2).max(8).toUpperCase(),
  localAmount: z.coerce.number().positive().optional(),
  paymentAccountType: z.enum(["bank", "momo"]).default("bank"),
  paymentAccountNumber: z.string().trim().min(6).max(24).nullable().optional(),
  paymentNetworkId: z.string().trim().min(2).max(120).nullable().optional(),
  status: z
    .enum(["pending_activation", "active", "paused", "cancelled", "past_due"])
    .default("active"),
  nextChargeAt: z.coerce.date(),
});

export const listSubscriptionsQuerySchema = z
  .object({
    merchantId: z.string().trim().min(1).optional(),
    environment: environmentInputSchema.optional(),
    planId: z.string().trim().min(1).optional(),
    status: z
      .enum(["pending_activation", "active", "paused", "cancelled", "past_due"])
      .optional(),
    search: z.string().trim().min(1).optional(),
  })
  .merge(optionalPaginationQuerySchema);

export const updateSubscriptionSchema = z.object({
  status: z
    .enum(["pending_activation", "active", "paused", "cancelled", "past_due"])
    .optional(),
  nextChargeAt: z.coerce.date().optional(),
  retryAvailableAt: z.coerce.date().nullable().optional(),
  lastChargeAt: z.coerce.date().nullable().optional(),
  localAmount: z.coerce.number().positive().optional(),
  paymentAccountType: z.enum(["bank", "momo"]).optional(),
  paymentAccountNumber: z.string().trim().min(6).max(24).nullable().optional(),
  paymentNetworkId: z.string().trim().min(2).max(120).nullable().optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
