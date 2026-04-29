import { z } from "zod";

import { optionalPaginationQuerySchema } from "@/shared/utils/pagination";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

const currencySchema = z.string().trim().min(2).max(12).toUpperCase();

const recurringSchema = z
  .object({
    enabled: z.boolean().default(false),
    interval: z.enum(["day", "week", "month", "year"]).nullable().optional(),
    intervalCount: z.coerce.number().int().min(1).max(120).nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .default({ enabled: false })
  .superRefine((input, ctx) => {
    if (!input.enabled) {
      return;
    }

    if (!input.interval) {
      ctx.addIssue({
        code: "custom",
        path: ["interval"],
        message: "Recurring payments require an interval.",
      });
    }

    if (!input.intervalCount) {
      ctx.addIssue({
        code: "custom",
        path: ["intervalCount"],
        message: "Recurring payments require an interval count.",
      });
    }
  });

const paymentStatusSchema = z.enum([
  "open",
  "pending",
  "paid",
  "settling",
  "settled",
  "failed",
  "cancelled",
]);

export const createPaymentSchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
  customerId: objectIdSchema.nullable().optional(),
  settlementRouteId: objectIdSchema.nullable().optional(),
  amount: z.coerce.number().positive(),
  currency: currencySchema,
  description: z.string().trim().min(2).max(240),
  recurring: recurringSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const listPaymentsQuerySchema = z
  .object({
    merchantId: objectIdSchema.optional(),
    environment: environmentInputSchema.optional(),
    status: paymentStatusSchema.optional(),
    customerId: objectIdSchema.optional(),
    recurring: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    search: z.string().trim().min(1).optional(),
  })
  .merge(optionalPaginationQuerySchema);

export const updatePaymentSchema = z.object({
  customerId: objectIdSchema.nullable().optional(),
  settlementRouteId: objectIdSchema.nullable().optional(),
  amount: z.coerce.number().positive().optional(),
  currency: currencySchema.optional(),
  description: z.string().trim().min(2).max(240).optional(),
  status: paymentStatusSchema.optional(),
  recurring: recurringSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const paymentParamSchema = z.object({
  paymentId: z.string().trim().min(1),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
