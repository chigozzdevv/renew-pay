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
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const submitCheckoutVerificationSchema = z.object({
  phoneNumber: z.string().trim().min(7).max(24),
  dateOfBirth: z.string().trim().min(10).max(32),
  bvn: z.string().trim().min(8).max(32),
  stateOfOrigin: z.string().trim().min(2).max(120),
  stateOfResidence: z.string().trim().min(2).max(120),
  lgaOfOrigin: z.string().trim().min(2).max(120),
  lgaOfResidence: z.string().trim().min(2).max(120),
  addressLine1: z.string().trim().min(4).max(180),
  addressLine2: z.string().trim().max(180).optional(),
  addressLine3: z.string().trim().max(180).optional(),
  middleName: z.string().trim().max(120).optional(),
  country: z.string().trim().min(2).max(3).toUpperCase().default("NG"),
});

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
export type CheckoutSessionParamInput = z.infer<typeof checkoutSessionParamSchema>;
export type CheckoutMarketQuoteQuery = z.infer<typeof checkoutMarketQuoteQuerySchema>;
export type SubmitCheckoutCustomerInput = z.infer<typeof submitCheckoutCustomerSchema>;
export type SubmitCheckoutVerificationInput = z.infer<
  typeof submitCheckoutVerificationSchema
>;
