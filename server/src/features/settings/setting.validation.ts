import { z } from "zod";

import { isSolanaAddress } from "@/shared/constants/solana";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

const addressSchema = z
  .string()
  .trim()
  .refine(isSolanaAddress, "Must be a valid Solana address.");

const nullableUrlSchema = z
  .union([z.string().trim().url(), z.literal(""), z.null()])
  .transform((value) => {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  });

export const merchantParamSchema = z.object({
  merchantId: objectIdSchema,
});

const businessSettingsSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  supportEmail: z.email().trim().toLowerCase().optional(),
  defaultMarket: z.string().trim().min(2).max(8).toUpperCase().optional(),
  timezone: z.string().trim().min(2).max(80).optional(),
  displayMode: z.string().trim().min(2).max(40).optional(),
  fallbackCurrency: z.string().trim().min(2).max(12).toUpperCase().optional(),
  statementDescriptor: z.string().trim().min(2).max(40).optional(),
  brandAccent: z.string().trim().min(2).max(40).optional(),
  logoUrl: nullableUrlSchema.optional(),
  customerDomain: z.string().trim().min(2).max(160).optional(),
});

const walletSettingsSchema = z.object({
  primaryWallet: addressSchema.optional(),
  walletAlerts: z.boolean().optional(),
});

const checkoutSettingsSchema = z.object({
  mode: z.enum(["modal", "redirect"]).optional(),
  returnPage: nullableUrlSchema.optional(),
  allowedDomains: z.array(z.string().trim().min(2).max(160)).max(25).optional(),
});

const notificationSettingsSchema = z.object({
  paymentAlerts: z.boolean().optional(),
  settlementAlerts: z.boolean().optional(),
  verificationAlerts: z.boolean().optional(),
  developerAlerts: z.boolean().optional(),
  securityAlerts: z.boolean().optional(),
});

const securitySettingsSchema = z.object({
  sessionTimeout: z.string().trim().min(2).max(80).optional(),
  enforceTwoFactor: z.boolean().optional(),
});

export const updateSettingsSchema = z
  .object({
    actor: z.string().trim().min(2).max(120).default("system"),
    environment: environmentInputSchema.default("test"),
    business: businessSettingsSchema.optional(),
    wallets: walletSettingsSchema.optional(),
    checkout: checkoutSettingsSchema.optional(),
    notifications: notificationSettingsSchema.optional(),
    security: securitySettingsSchema.optional(),
  })
  .refine(
    (value) =>
      value.business !== undefined ||
      value.wallets !== undefined ||
      value.checkout !== undefined ||
      value.notifications !== undefined ||
      value.security !== undefined,
    {
      message: "At least one settings section must be provided.",
      path: [],
    }
  );

export const saveWalletSchema = z.object({
  actor: z.string().trim().min(2).max(120).default("system"),
  environment: environmentInputSchema.default("test"),
  primaryWallet: addressSchema,
  walletAlerts: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type SaveWalletInput = z.infer<typeof saveWalletSchema>;
