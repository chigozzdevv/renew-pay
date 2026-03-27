import { z } from "zod";

const objectIdSchema = z.string().trim().min(1);

export const createCheckoutSessionSchema = z.object({
  planId: objectIdSchema,
  expiresInMinutes: z.coerce.number().int().min(5).max(120).default(30),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const checkoutSessionParamSchema = z.object({
  sessionId: objectIdSchema,
});

export const checkoutMarketQuoteQuerySchema = z.object({
  market: z.string().trim().min(2).max(8).toUpperCase(),
});

export const submitCheckoutCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180),
  market: z.string().trim().min(2).max(8).toUpperCase(),
  paymentAccountType: z.enum(["bank", "momo"]).default("bank"),
  paymentAccountNumber: z.string().trim().min(6).max(24).nullable().optional(),
  paymentNetworkId: z.string().trim().min(2).max(120).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
export type CheckoutSessionParamInput = z.infer<typeof checkoutSessionParamSchema>;
export type CheckoutMarketQuoteQuery = z.infer<typeof checkoutMarketQuoteQuerySchema>;
export type SubmitCheckoutCustomerInput = z.infer<typeof submitCheckoutCustomerSchema>;
