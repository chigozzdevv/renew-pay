import { z } from "zod";

import { getDirectSolanaSettlementAsset } from "@/features/settlement/providers/direct/direct.assets";
import { isUmbraSettlementAsset } from "@/features/settlement/providers/umbra/umbra.assets";
import { isSolanaAddress } from "@/shared/constants/solana";
import { optionalPaginationQuerySchema } from "@/shared/utils/pagination";
import { environmentInputSchema } from "@/shared/utils/runtime-environment";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

const settlementModeSchema = z.enum(["standard", "private"]);
const settlementProviderSchema = z.enum(["direct", "umbra"]);
const settlementChainSchema = z.enum(["solana", "avalanche"]);
const settlementStatusSchema = z.enum(["active", "disabled"]);
const privacyStrategySchema = z.enum(["receiver_claimable_utxo"]);

const routeBaseSchema = z.object({
  merchantId: objectIdSchema,
  environment: environmentInputSchema.default("test"),
  routeCode: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  name: z.string().trim().min(2).max(120),
  mode: settlementModeSchema.default("standard"),
  provider: settlementProviderSchema.default("direct"),
  chain: settlementChainSchema.default("solana"),
  assetSymbol: z.string().trim().min(2).max(12).toUpperCase().default("USDC"),
  assetMint: z.string().trim().min(1).nullable().optional(),
  assetDecimals: z.coerce.number().int().min(0).max(18).default(6),
  destinationAddress: z.string().trim().min(1).nullable().optional(),
  feeBps: z.coerce.number().int().min(0).max(10000).default(0),
  isDefault: z.boolean().default(false),
  status: settlementStatusSchema.default("active"),
  privacy: z
    .object({
      strategy: privacyStrategySchema.default("receiver_claimable_utxo"),
      viewingKeyPolicy: z.literal("merchant_controlled").default("merchant_controlled"),
    })
    .nullable()
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function validateRouteShape(
  input: z.infer<typeof routeBaseSchema>,
  ctx: z.RefinementCtx
) {
  const knownDirectSolanaAsset = getDirectSolanaSettlementAsset(
    input.assetSymbol
  );

  if (input.provider === "umbra") {
    if (input.mode !== "private") {
      ctx.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Umbra routes must use private mode.",
      });
    }

    if (input.chain !== "solana") {
      ctx.addIssue({
        code: "custom",
        path: ["chain"],
        message: "Umbra routes are only available on Solana.",
      });
    }

    if (!isUmbraSettlementAsset(input.assetSymbol)) {
      ctx.addIssue({
        code: "custom",
        path: ["assetSymbol"],
        message: "Umbra settlement currently supports USDC on Solana.",
      });
    }

    if (!input.destinationAddress) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationAddress"],
        message: "Umbra settlement routes require a recipient wallet address.",
      });
    }

    if (
      input.destinationAddress &&
      !isSolanaAddress(input.destinationAddress)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationAddress"],
        message: "Destination must be a valid Solana address.",
      });
    }

    return;
  }

  if (input.provider === "direct" && input.chain === "solana") {
    if (input.mode !== "standard") {
      ctx.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Direct Solana routes must use standard mode.",
      });
    }

    if (!input.assetMint && !knownDirectSolanaAsset) {
      ctx.addIssue({
        code: "custom",
        path: ["assetMint"],
        message: "Direct Solana settlement routes require an SPL token mint.",
      });
    }

    if (input.assetMint && !isSolanaAddress(input.assetMint)) {
      ctx.addIssue({
        code: "custom",
        path: ["assetMint"],
        message: "Settlement asset mint must be a valid Solana address.",
      });
    }
  }

  if (input.mode === "private") {
    ctx.addIssue({
      code: "custom",
      path: ["provider"],
      message: "Private settlement requires a privacy provider.",
    });
  }

  if (!input.destinationAddress) {
    ctx.addIssue({
      code: "custom",
      path: ["destinationAddress"],
      message: "Standard settlement routes require a destination address.",
    });
  }

  if (
    input.chain === "solana" &&
    input.destinationAddress &&
    !isSolanaAddress(input.destinationAddress)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["destinationAddress"],
      message: "Destination must be a valid Solana address.",
    });
  }
}

export const createSettlementRouteSchema =
  routeBaseSchema.superRefine(validateRouteShape);

export const listSettlementRoutesQuerySchema = z
  .object({
    merchantId: objectIdSchema.optional(),
    environment: environmentInputSchema.optional(),
    mode: settlementModeSchema.optional(),
    provider: settlementProviderSchema.optional(),
    chain: settlementChainSchema.optional(),
    status: settlementStatusSchema.optional(),
    search: z.string().trim().min(1).optional(),
  })
  .merge(optionalPaginationQuerySchema);

export const updateSettlementRouteSchema = routeBaseSchema
  .omit({ merchantId: true, environment: true })
  .partial()
  .superRefine((input, ctx) => {
    const knownDirectSolanaAsset = input.assetSymbol
      ? getDirectSolanaSettlementAsset(input.assetSymbol)
      : null;

    if (input.provider === "umbra") {
      if (input.mode && input.mode !== "private") {
        ctx.addIssue({
          code: "custom",
          path: ["mode"],
          message: "Umbra routes must use private mode.",
        });
      }

      if (input.chain && input.chain !== "solana") {
        ctx.addIssue({
          code: "custom",
          path: ["chain"],
          message: "Umbra routes are only available on Solana.",
        });
      }

      if (input.assetSymbol && !isUmbraSettlementAsset(input.assetSymbol)) {
        ctx.addIssue({
          code: "custom",
          path: ["assetSymbol"],
          message: "Umbra settlement currently supports USDC on Solana.",
        });
      }

      if (
        input.destinationAddress &&
        !isSolanaAddress(input.destinationAddress)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationAddress"],
          message: "Destination must be a valid Solana address.",
        });
      }
    }

    if (input.mode === "private" && input.provider !== "umbra") {
      ctx.addIssue({
        code: "custom",
        path: ["provider"],
        message: "Private settlement requires a privacy provider.",
      });
    }

    if (
      input.provider === "direct" &&
      input.chain === "solana" &&
      input.mode &&
      input.mode !== "standard"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Direct Solana routes must use standard mode.",
      });
    }

    if (
      input.provider === "direct" &&
      input.chain === "solana" &&
      input.assetSymbol &&
      !input.assetMint &&
      !knownDirectSolanaAsset
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["assetMint"],
        message: "Direct Solana settlement routes require an SPL token mint.",
      });
    }

    if (input.assetMint && !isSolanaAddress(input.assetMint)) {
      ctx.addIssue({
        code: "custom",
        path: ["assetMint"],
        message: "Settlement asset mint must be a valid Solana address.",
      });
    }

    if (
      input.chain === "solana" &&
      input.destinationAddress &&
      !isSolanaAddress(input.destinationAddress)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationAddress"],
        message: "Destination must be a valid Solana address.",
      });
    }
  });

export const settlementRouteParamSchema = z.object({
  routeId: objectIdSchema,
});

export type CreateSettlementRouteInput = z.infer<
  typeof createSettlementRouteSchema
>;
export type ListSettlementRoutesQuery = z.infer<
  typeof listSettlementRoutesQuerySchema
>;
export type UpdateSettlementRouteInput = z.infer<
  typeof updateSettlementRouteSchema
>;
