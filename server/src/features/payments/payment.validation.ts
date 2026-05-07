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

const collectionStatusSchema = z.enum([
  "created",
  "collecting",
  "paid",
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

export const createCollectionSchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
  amount: z.coerce.number().positive(),
  currency: currencySchema,
  reference: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(240).optional(),
  recurring: recurringSchema,
  settlement: z.string().trim().min(1).max(160).optional(),
  customer: z
    .object({
      reference: z.string().trim().min(1).max(160).optional(),
      email: z.email().trim().toLowerCase().optional(),
      name: z.string().trim().min(2).max(160).optional(),
    })
    .optional(),
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

export const listCollectionsQuerySchema = z
  .object({
    merchantId: objectIdSchema.optional(),
    environment: environmentInputSchema.optional(),
    status: collectionStatusSchema.optional(),
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

export const collectionParamSchema = z.object({
  collectionId: z.string().trim().min(1),
});

export const paymentParamSchema = z.object({
  paymentId: z.string().trim().min(1),
});

export const publicPaymentParamSchema = z.object({
  payId: z.string().trim().min(3).max(90),
});

const publicCheckoutCustomerSchema = z.object({
  reference: z.string().trim().min(1).max(160).optional(),
  email: z.email().trim().toLowerCase().optional(),
  name: z.string().trim().min(2).max(120).optional(),
});

export const startPublicPaymentSchema = z.object({
  payerEmail: z.email().trim().toLowerCase().optional(),
  payerName: z.string().trim().min(2).max(120).optional(),
  customer: publicCheckoutCustomerSchema.optional(),
});

export const submitPublicCheckoutCustomerSchema = publicCheckoutCustomerSchema
  .required({
    email: true,
    name: true,
  });

export const startPublicCheckoutKycSchema = z.object({
  bvn: z.string().trim().regex(/^\d{11}$/, "BVN must be 11 digits."),
  kesMobileNetwork: z.string().trim().min(1).max(80).optional(),
  kesShortcode: z.string().trim().min(1).max(80).optional(),
});

export const selectPublicCheckoutKycMethodSchema = z.object({
  verificationMethod: z.string().trim().min(1).max(80),
  accountNumber: z.string().trim().min(5).max(30).optional(),
  bankCode: z.string().trim().min(2).max(20).optional(),
});

export const confirmPublicCheckoutPhoneSchema = z.object({
  phone: z.string().trim().min(6).max(32),
});

export const confirmPublicCheckoutOtpSchema = z.object({
  otp: z.string().trim().min(3).max(12),
});

export type ConfirmPublicCheckoutOtpInput = z.infer<typeof confirmPublicCheckoutOtpSchema>;
export type ConfirmPublicCheckoutPhoneInput = z.infer<typeof confirmPublicCheckoutPhoneSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type ListCollectionsQuery = z.infer<typeof listCollectionsQuerySchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type SelectPublicCheckoutKycMethodInput = z.infer<
  typeof selectPublicCheckoutKycMethodSchema
>;
export type StartPublicCheckoutKycInput = z.infer<typeof startPublicCheckoutKycSchema>;
export type StartPublicPaymentInput = z.infer<typeof startPublicPaymentSchema>;
export type SubmitPublicCheckoutCustomerInput = z.infer<
  typeof submitPublicCheckoutCustomerSchema
>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
