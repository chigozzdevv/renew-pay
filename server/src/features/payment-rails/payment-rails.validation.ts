import { z } from "zod";

import {
  environmentInputSchema,
  optionalEnvironmentInputSchema,
} from "@/shared/utils/runtime-environment";

export const listChannelsQuerySchema = z.object({
  environment: environmentInputSchema.default("test"),
  country: z.string().trim().min(2).max(3).toUpperCase().optional(),
  currency: z.string().trim().min(2).max(8).toUpperCase().optional(),
  channelType: z.string().trim().min(2).max(32).optional(),
  rampType: z.string().trim().min(2).max(32).optional(),
  includeInactive: z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === "boolean" ? value : value.trim().toLowerCase() === "true"
    )
    .default(false),
});

export const listNetworksQuerySchema = z.object({
  environment: environmentInputSchema.default("test"),
  country: z.string().trim().min(2).max(3).toUpperCase().optional(),
  channelId: z.string().trim().min(2).max(120).optional(),
  includeInactive: z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === "boolean" ? value : value.trim().toLowerCase() === "true"
    )
    .default(false),
});

export const syncPaymentRailSchema = z.object({
  environment: environmentInputSchema.default("test"),
  country: z.string().trim().min(2).max(3).toUpperCase().optional(),
});

export const createWidgetQuoteSchema = z
  .object({
    environment: environmentInputSchema.default("test"),
    currency: z.string().trim().min(2).max(8).toUpperCase(),
    localAmount: z.coerce.number().positive().optional(),
    cryptoAmount: z.coerce.number().positive().optional(),
    coin: z.string().trim().min(2).max(16).default("USDC"),
    network: z.string().trim().min(2).max(32).default("SOLANA"),
    channelId: z.string().trim().min(2).max(120),
    transactionType: z.enum(["Buy", "Sell"]).default("Buy"),
  })
  .superRefine((value, context) => {
    if (!value.localAmount && !value.cryptoAmount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["localAmount"],
        message: "Either localAmount or cryptoAmount is required.",
      });
    }
  });

export const resolveBankAccountSchema = z.object({
  environment: environmentInputSchema.default("test"),
  accountNumber: z.string().trim().min(6).max(24),
  networkId: z.string().trim().min(2).max(120),
});

export const yellowCardWebhookSchema = z.object({
  environment: optionalEnvironmentInputSchema,
  id: z.string().trim().min(1).optional(),
  sequenceId: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  event: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  collection: z.record(z.string(), z.unknown()).optional(),
});

export const collectionParamSchema = z.object({
  collectionId: z.string().trim().min(3).max(140),
});

export type ListChannelsQuery = z.infer<typeof listChannelsQuerySchema>;
export type ListNetworksQuery = z.infer<typeof listNetworksQuerySchema>;
export type SyncPaymentRailInput = z.infer<typeof syncPaymentRailSchema>;
export type CreateWidgetQuoteInput = z.infer<typeof createWidgetQuoteSchema>;
export type ResolveBankAccountInput = z.infer<typeof resolveBankAccountSchema>;
export type YellowCardWebhookInput = z.infer<typeof yellowCardWebhookSchema>;
export type CollectionParamInput = z.infer<typeof collectionParamSchema>;
