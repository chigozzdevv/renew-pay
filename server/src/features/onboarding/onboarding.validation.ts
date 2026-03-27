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

export const onboardingBusinessProfileSchema = z.object({
  environment: environmentInputSchema.default("test"),
  businessName: z.string().trim().min(2).max(160),
  supportEmail: z.email().trim().toLowerCase(),
  billingTimezone: z.string().trim().min(2).max(80),
  supportedMarkets: z.array(marketSchema).min(1),
  defaultMarket: marketSchema.optional(),
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

export const onboardingPayoutSettingsSchema = z.object({
  environment: environmentInputSchema.default("test"),
  payoutWallet: addressSchema,
});

export const onboardingGovernanceSchema = z.object({
  environment: environmentInputSchema.default("test"),
  enabled: z.boolean(),
});

export const onboardingCompleteSchema = z.object({
  environment: environmentInputSchema.default("test"),
});

export type OnboardingQuery = z.infer<typeof onboardingQuerySchema>;
export type OnboardingBusinessProfileInput = z.infer<typeof onboardingBusinessProfileSchema>;
export type OnboardingVerificationStartInput = z.infer<typeof onboardingVerificationStartSchema>;
export type OnboardingPayoutSettingsInput = z.infer<typeof onboardingPayoutSettingsSchema>;
export type OnboardingGovernanceInput = z.infer<typeof onboardingGovernanceSchema>;
export type OnboardingCompleteInput = z.infer<typeof onboardingCompleteSchema>;
