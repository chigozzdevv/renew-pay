import { z } from "zod";

import { optionalPaginationQuerySchema } from "@/shared/utils/pagination";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

const customerStatusSchema = z.enum(["active", "paused", "at_risk", "blacklisted"]);
const billingStateSchema = z.enum(["healthy", "at_risk", "past_due", "paused"]);
const paymentMethodStateSchema = z.enum(["ok", "update_needed", "expired", "missing"]);

export const listCustomersQuerySchema = z
  .object({
    merchantId: objectIdSchema,
    environment: environmentInputSchema.optional(),
    status: customerStatusSchema.optional(),
    market: z.string().trim().min(2).max(8).toUpperCase().optional(),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .merge(optionalPaginationQuerySchema);

export const customerParamSchema = z.object({
  customerId: objectIdSchema,
});

export const createCustomerSchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
  customerRef: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(160),
  email: z.email().trim().toLowerCase(),
  market: z.string().trim().min(2).max(8).toUpperCase(),
  status: customerStatusSchema.default("active"),
  billingState: billingStateSchema.default("healthy"),
  paymentMethodState: paymentMethodStateSchema.default("ok"),
  subscriptionCount: z.coerce.number().int().min(0).default(0),
  monthlyVolumeUsdc: z.coerce.number().nonnegative().default(0),
  nextRenewalAt: z.coerce.date().nullish().transform((value) => value ?? null),
  lastChargeAt: z.coerce.date().nullish().transform((value) => value ?? null),
  autoReminderEnabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
  actor: z.string().trim().min(2).max(120).default("system"),
});

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    email: z.email().trim().toLowerCase().optional(),
    market: z.string().trim().min(2).max(8).toUpperCase().optional(),
    status: customerStatusSchema.optional(),
    billingState: billingStateSchema.optional(),
    paymentMethodState: paymentMethodStateSchema.optional(),
    subscriptionCount: z.coerce.number().int().min(0).optional(),
    monthlyVolumeUsdc: z.coerce.number().nonnegative().optional(),
    nextRenewalAt: z.coerce.date().nullish().transform((value) => value ?? null),
    lastChargeAt: z.coerce.date().nullish().transform((value) => value ?? null),
    autoReminderEnabled: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    actor: z.string().trim().min(2).max(120).default("system"),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.email !== undefined ||
      value.market !== undefined ||
      value.status !== undefined ||
      value.billingState !== undefined ||
      value.paymentMethodState !== undefined ||
      value.subscriptionCount !== undefined ||
      value.monthlyVolumeUsdc !== undefined ||
      value.nextRenewalAt !== undefined ||
      value.lastChargeAt !== undefined ||
      value.autoReminderEnabled !== undefined ||
      value.metadata !== undefined,
    {
      message: "At least one editable field must be provided.",
      path: [],
    }
  );

export const blacklistCustomerSchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
  reason: z.string().trim().min(2).max(300),
  actor: z.string().trim().min(2).max(120).default("system"),
});

export const customerActionSchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
  actor: z.string().trim().min(2).max(120).default("system"),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerActionInput = z.infer<typeof customerActionSchema>;
export type BlacklistCustomerInput = z.infer<typeof blacklistCustomerSchema>;
