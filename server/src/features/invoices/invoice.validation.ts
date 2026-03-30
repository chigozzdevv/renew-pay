import { z } from "zod";

import { optionalPaginationQuerySchema } from "@/shared/utils/pagination";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

const invoiceStatusSchema = z.enum([
  "draft",
  "issued",
  "pending_payment",
  "processing",
  "paid",
  "overdue",
  "void",
]);

const currencySchema = z.string().trim().min(2).max(8).toUpperCase();

const invoiceLineItemSchema = z.object({
  description: z.string().trim().min(2).max(160),
  quantity: z.coerce.number().int().positive().default(1),
  unitAmountUsd: z.coerce.number().positive(),
});

export const createInvoiceSchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
  title: z.string().trim().min(2).max(160),
  customerName: z.string().trim().min(2).max(160),
  customerEmail: z.email().trim().toLowerCase(),
  billingCurrency: currencySchema,
  dueDate: z.coerce.date(),
  note: z.string().trim().min(2).max(600).nullable().optional(),
  lineItems: z.array(invoiceLineItemSchema).min(1).max(20),
  status: z.enum(["draft", "issued"]).default("issued"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const updateInvoiceSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    customerName: z.string().trim().min(2).max(160).optional(),
    customerEmail: z.email().trim().toLowerCase().optional(),
    billingCurrency: currencySchema.optional(),
    dueDate: z.coerce.date().optional(),
    note: z.string().trim().min(2).max(600).nullable().optional(),
    lineItems: z.array(invoiceLineItemSchema).min(1).max(20).optional(),
    status: z.enum(["draft", "issued", "void"]).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.customerName !== undefined ||
      value.customerEmail !== undefined ||
      value.billingCurrency !== undefined ||
      value.dueDate !== undefined ||
      value.note !== undefined ||
      value.lineItems !== undefined ||
      value.status !== undefined ||
      value.metadata !== undefined,
    {
      message: "At least one editable field must be provided.",
      path: [],
    }
  );

export const listInvoicesQuerySchema = z
  .object({
    merchantId: objectIdSchema.optional(),
    environment: environmentInputSchema.optional(),
    status: invoiceStatusSchema.optional(),
    search: z.string().trim().min(1).max(160).optional(),
  })
  .merge(optionalPaginationQuerySchema);

export const invoiceParamSchema = z.object({
  invoiceId: objectIdSchema,
});

export const publicInvoiceParamSchema = z.object({
  publicToken: z.string().trim().min(12).max(160),
});

export const submitInvoiceVerificationSchema = z
  .object({
    bvn: z.string().trim().min(8).max(32).optional(),
    otp: z.string().trim().min(4).max(12).optional(),
  })
  .refine((value) => Boolean(value.bvn?.trim()) !== Boolean(value.otp?.trim()), {
    message: "Provide either BVN or OTP.",
    path: [],
  });

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type SubmitInvoiceVerificationInput = z.infer<
  typeof submitInvoiceVerificationSchema
>;
