import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  assertDirectSolanaRouteConfig,
  resolveDirectSolanaAsset,
} from "@/features/settlement/providers/direct/direct-solana.service";
import { getUmbraSettlementAsset } from "@/features/settlement/providers/umbra/umbra.assets";
import {
  assertUmbraRouteConfig,
  buildUmbraRoutePrivacy,
} from "@/features/settlement/providers/umbra/umbra.service";
import {
  SettlementRouteModel,
  type SettlementRouteRecord,
} from "@/features/settlement/settlement-route.model";
import {
  type CreateSettlementRouteInput,
  type ListSettlementRoutesQuery,
  type UpdateSettlementRouteInput,
} from "@/features/settlement/settlement.validation";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";
import {
  buildPagination,
  resolvePagination,
  type ListResult,
} from "@/shared/utils/pagination";
import {
  createRuntimeModeCondition,
} from "@/shared/utils/runtime-environment";

function normalizeRouteCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function deriveRouteCode(input: Pick<CreateSettlementRouteInput, "name" | "routeCode">) {
  return normalizeRouteCode(input.routeCode ?? input.name) || "settlement-route";
}

function normalizeRouteInput<T extends CreateSettlementRouteInput | UpdateSettlementRouteInput>(
  input: T
) {
  if (input.provider !== "umbra") {
    if (input.provider === "direct" && input.chain === "solana") {
      const asset = resolveDirectSolanaAsset(input);

      return {
        ...input,
        assetSymbol: asset.symbol,
        assetMint: asset.mint ?? input.assetMint ?? null,
        assetDecimals: asset.decimals,
        mode: "standard" as const,
        privacy: null,
      };
    }

    return input;
  }

  const assetSymbol = input.assetSymbol ?? "USDC";
  const asset = getUmbraSettlementAsset(assetSymbol);

  return {
    ...input,
    assetMint: asset?.mint ?? input.assetMint ?? null,
    assetDecimals: asset?.decimals ?? input.assetDecimals ?? 6,
    mode: "private" as const,
    chain: "solana" as const,
    privacy: {
      strategy: "receiver_claimable_utxo" as const,
      viewingKeyPolicy: "merchant_controlled" as const,
    },
  };
}

function toSettlementRouteResponse(document: SettlementRouteRecord) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    environment: document.environment,
    routeCode: document.routeCode,
    name: document.name,
    mode: document.mode,
    provider: document.provider,
    chain: document.chain,
    assetSymbol: document.assetSymbol,
    assetMint: document.assetMint ?? null,
    assetDecimals: document.assetDecimals,
    destinationAddress: document.destinationAddress ?? null,
    feeBps: document.feeBps,
    isDefault: document.isDefault,
    status: document.status,
    privacy: document.privacy
      ? {
          provider: document.privacy.provider ?? null,
          strategy: document.privacy.strategy ?? null,
          poolMint: document.privacy.poolMint ?? null,
          viewingKeyPolicy: document.privacy.viewingKeyPolicy ?? null,
        }
      : null,
    metadata: document.metadata ?? {},
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function ensureMerchant(merchantId: string) {
  const merchant = await MerchantModel.exists({ _id: merchantId });

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }
}

async function applyDefaultRoutePolicy(input: {
  merchantId: string;
  environment: RuntimeMode;
  routeId?: string;
}) {
  await SettlementRouteModel.updateMany(
    {
      merchantId: input.merchantId,
      ...createRuntimeModeCondition("environment", input.environment),
      ...(input.routeId ? { _id: { $ne: input.routeId } } : {}),
    },
    { $set: { isDefault: false } }
  ).exec();
}

async function ensureRouteScope(
  routeId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const mongoQuery: Record<string, unknown> = {
    _id: routeId,
  };

  if (merchantId) {
    mongoQuery.merchantId = merchantId;
  }

  if (environment) {
    Object.assign(mongoQuery, createRuntimeModeCondition("environment", environment));
  }

  const route = await SettlementRouteModel.findOne(mongoQuery).exec();

  if (!route) {
    throw new HttpError(404, "Settlement route was not found.");
  }

  return route;
}

export async function createSettlementRoute(input: CreateSettlementRouteInput) {
  const normalized = normalizeRouteInput(input);
  await ensureMerchant(normalized.merchantId);
  const umbraAsset =
    normalized.provider === "umbra"
      ? assertUmbraRouteConfig(normalized)
      : null;
  const directSolanaAsset =
    normalized.provider === "direct" && normalized.chain === "solana"
      ? assertDirectSolanaRouteConfig(normalized)
      : null;

  if (normalized.isDefault) {
    await applyDefaultRoutePolicy({
      merchantId: normalized.merchantId,
      environment: normalized.environment,
    });
  }

  const route = await SettlementRouteModel.create({
    merchantId: normalized.merchantId,
    environment: normalized.environment,
    routeCode: deriveRouteCode(normalized),
    name: normalized.name,
    mode: normalized.mode,
    provider: normalized.provider,
    chain: normalized.chain,
    assetSymbol: normalized.assetSymbol,
    assetMint:
      normalized.assetMint ??
      umbraAsset?.mint ??
      directSolanaAsset?.mint ??
      null,
    assetDecimals:
      normalized.assetDecimals ??
      umbraAsset?.decimals ??
      directSolanaAsset?.decimals ??
      6,
    destinationAddress: normalized.destinationAddress ?? null,
    feeBps: normalized.feeBps,
    isDefault: normalized.isDefault,
    status: normalized.status,
    privacy:
      normalized.provider === "umbra"
        ? buildUmbraRoutePrivacy({
            assetSymbol: normalized.assetSymbol,
            assetMint: normalized.assetMint ?? umbraAsset?.mint ?? null,
          })
        : null,
    metadata: normalized.metadata ?? {},
  });

  return toSettlementRouteResponse(route);
}

export async function listSettlementRoutes(query: ListSettlementRoutesQuery) {
  const filters: Record<string, unknown>[] = [];

  if (query.merchantId) {
    filters.push({ merchantId: query.merchantId });
  }

  if (query.environment) {
    filters.push(createRuntimeModeCondition("environment", query.environment));
  }

  if (query.mode) {
    filters.push({ mode: query.mode });
  }

  if (query.provider) {
    filters.push({ provider: query.provider });
  }

  if (query.chain) {
    filters.push({ chain: query.chain });
  }

  if (query.status) {
    filters.push({ status: query.status });
  }

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "i");
    filters.push({
      $or: [
        { routeCode: pattern },
        { name: pattern },
        { assetSymbol: pattern },
        { destinationAddress: pattern },
      ],
    });
  }

  const mongoQuery =
    filters.length === 0
      ? {}
      : filters.length === 1
        ? filters[0]
        : { $and: filters };
  const pagination = resolvePagination(query);

  if (!pagination) {
    const routes = await SettlementRouteModel.find(mongoQuery)
      .sort({ isDefault: -1, createdAt: -1 })
      .exec();

    return {
      items: routes.map(toSettlementRouteResponse),
    } satisfies ListResult<ReturnType<typeof toSettlementRouteResponse>>;
  }

  const [total, routes] = await Promise.all([
    SettlementRouteModel.countDocuments(mongoQuery).exec(),
    SettlementRouteModel.find(mongoQuery)
      .sort({ isDefault: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: routes.map(toSettlementRouteResponse),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toSettlementRouteResponse>>;
}

export async function getSettlementRouteById(
  routeId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const route = await ensureRouteScope(routeId, merchantId, environment);

  return toSettlementRouteResponse(route);
}

export async function getDefaultSettlementRoute(input: {
  merchantId: string;
  environment?: RuntimeMode;
}) {
  const route = await SettlementRouteModel.findOne({
    merchantId: input.merchantId,
    ...(input.environment
      ? createRuntimeModeCondition("environment", input.environment)
      : {}),
    isDefault: true,
    status: "active",
  }).exec();

  if (!route) {
    throw new HttpError(404, "Default settlement route was not found.");
  }

  return toSettlementRouteResponse(route);
}

export async function updateSettlementRoute(
  routeId: string,
  input: UpdateSettlementRouteInput,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const route = await ensureRouteScope(routeId, merchantId, environment);
  const normalized = normalizeRouteInput(input);
  const routeEnvironment = route.environment === "live" ? "live" : "test";

  if (normalized.isDefault) {
    await applyDefaultRoutePolicy({
      merchantId: route.merchantId.toString(),
      environment: routeEnvironment,
      routeId: route._id.toString(),
    });
  }

  if (normalized.routeCode !== undefined) {
    route.routeCode = normalizeRouteCode(normalized.routeCode);
  }

  if (normalized.name !== undefined) {
    route.name = normalized.name;
  }

  if (normalized.mode !== undefined) {
    route.mode = normalized.mode;
  }

  if (normalized.provider !== undefined) {
    route.provider = normalized.provider;
  }

  if (normalized.chain !== undefined) {
    route.chain = normalized.chain;
  }

  if (normalized.assetSymbol !== undefined) {
    route.assetSymbol = normalized.assetSymbol;
  }

  if (normalized.assetMint !== undefined) {
    route.assetMint = normalized.assetMint ?? null;
  }

  if (normalized.assetDecimals !== undefined) {
    route.assetDecimals = normalized.assetDecimals;
  }

  if (normalized.destinationAddress !== undefined) {
    route.destinationAddress = normalized.destinationAddress ?? null;
  }

  if (normalized.feeBps !== undefined) {
    route.feeBps = normalized.feeBps;
  }

  if (normalized.isDefault !== undefined) {
    route.isDefault = normalized.isDefault;
  }

  if (normalized.status !== undefined) {
    route.status = normalized.status;
  }

  if (route.provider === "umbra") {
    const asset = assertUmbraRouteConfig(route);
    route.assetMint = asset.mint;
    route.assetDecimals = asset.decimals;
    route.privacy = buildUmbraRoutePrivacy({
      assetSymbol: route.assetSymbol,
      assetMint: route.assetMint,
    });
  } else if (route.provider === "direct" && route.chain === "solana") {
    const asset = assertDirectSolanaRouteConfig(route);
    route.mode = "standard";
    route.assetSymbol = asset.symbol;
    route.assetMint = asset.mint;
    route.assetDecimals = asset.decimals;
    route.privacy = null;
  } else if (route.mode === "private") {
    throw new HttpError(400, "Private settlement requires a privacy provider.");
  } else {
    route.privacy = null;
  }

  if (normalized.metadata !== undefined) {
    route.metadata = normalized.metadata;
  }

  await route.save();

  return toSettlementRouteResponse(route);
}
