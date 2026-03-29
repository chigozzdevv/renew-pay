import { z } from "zod";

import { isSolanaAddress } from "@/shared/constants/solana";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const addressSchema = z
  .string()
  .trim()
  .refine(isSolanaAddress, "Must be a valid Solana address.");
const marketSchema = z.string().trim().min(2).max(8).toUpperCase();

export const onboardingQuerySchema = z.object({
  environment: environmentInputSchema.default("test"),
});

export const onboardingBusinessSchema = z.object({
  environment: environmentInputSchema.default("test"),
  logoUrl: z.string().trim().url().max(2048).optional().or(z.literal("")),
  ownerName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(160),
  supportEmail: z.email().trim().toLowerCase(),
  supportedMarkets: z.array(marketSchema).min(1),
});

export const onboardingVerificationStartSchema = z.object({
  environment: environmentInputSchema.default("test"),
  subject: z.enum(["owner_kyc", "merchant_kyb"]).optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Country must be a valid ISO-2 code.")
    .optional(),
  registrationNumber: z.string().trim().min(2).max(120).optional(),
  taxId: z.string().trim().min(2).max(120).optional(),
  lang: z.string().trim().min(2).max(10).optional(),
});

export const onboardingPayoutSchema = z.object({
  environment: environmentInputSchema.default("test"),
  payoutWallet: addressSchema,
});

export const onboardingRegisterSchema = z.object({
  environment: environmentInputSchema.default("test"),
});

export type OnboardingQuery = z.infer<typeof onboardingQuerySchema>;
export type OnboardingBusinessInput = z.infer<typeof onboardingBusinessSchema>;
export type OnboardingVerificationStartInput = z.infer<typeof onboardingVerificationStartSchema>;
export type OnboardingPayoutInput = z.infer<typeof onboardingPayoutSchema>;
export type OnboardingRegisterInput = z.infer<typeof onboardingRegisterSchema>;
