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

export const syncOnrampSchema = z.object({
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

export const partnaWebhookSchema = z.object({
  environment: optionalEnvironmentInputSchema,
  event: z.string().trim().min(1).optional(),
  signature: z.string().trim().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type ListChannelsQuery = z.infer<typeof listChannelsQuerySchema>;
export type ListNetworksQuery = z.infer<typeof listNetworksQuerySchema>;
export type SyncOnrampInput = z.infer<typeof syncOnrampSchema>;
export type CreateWidgetQuoteInput = z.infer<typeof createWidgetQuoteSchema>;
export type PartnaWebhookInput = z.infer<typeof partnaWebhookSchema>;
