import { HttpError } from "@/shared/errors/http-error";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";

import { ChannelModel } from "@/features/payment-rails/channel.model";
import { NetworkModel } from "@/features/payment-rails/network.model";
import { getPartnaProvider } from "@/features/payment-rails/providers/partna/partna.factory";
import type { PartnaSupportedAsset } from "@/features/payment-rails/providers/partna/partna.types";
import type {
  CreateWidgetQuoteInput,
  ListChannelsQuery,
  ListNetworksQuery,
  SyncPaymentRailInput,
} from "@/features/payment-rails/payment-rails.validation";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { createRuntimeModeCondition } from "@/shared/utils/runtime-environment";

function toSafeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

const PARTNA_CRYPTO_NETWORKS = new Set([
  "avalanche",
  "binance",
  "bitcoin",
  "celo",
  "ethereum",
  "polygon",
  "solana",
  "tron",
]);

const PARTNA_VERIFIED_LOCAL_MARKETS: Record<
  string,
  {
    currencyName: string;
    symbol: string;
    countryCodes: string[];
    countries: string[];
  }
> = {
  GHS: {
    currencyName: "Ghanaian Cedi",
    symbol: "GHS",
    countryCodes: ["GH"],
    countries: ["Ghana"],
  },
  KES: {
    currencyName: "Kenyan Shilling",
    symbol: "KES",
    countryCodes: ["KE"],
    countries: ["Kenya"],
  },
  NGN: {
    currencyName: "Nigerian Naira",
    symbol: "NGN",
    countryCodes: ["NG"],
    countries: ["Nigeria"],
  },
};

function isPartnaLocalMarketAsset(input: {
  currency: string;
  destinationCurrency: string;
  network: string;
}) {
  return (
    Object.prototype.hasOwnProperty.call(PARTNA_VERIFIED_LOCAL_MARKETS, input.currency) &&
    input.destinationCurrency === input.currency &&
    !PARTNA_CRYPTO_NETWORKS.has(input.network)
  );
}

function getPartnaCountryMetadata(currency: string) {
  return PARTNA_VERIFIED_LOCAL_MARKETS[currency] ?? {
    currencyName: currency,
    symbol: currency,
    countryCodes: [],
    countries: [],
  };
}

function getPartnaMarketMetadata(currency: string, fallbackSymbol?: string) {
  const metadata = getPartnaCountryMetadata(currency);

  return {
    currencyName: metadata.currencyName,
    symbol: metadata.symbol ?? fallbackSymbol ?? currency,
    countryCodes: metadata.countryCodes,
    countries: metadata.countries,
  };
}

function buildPartnaChannelId(currency: string, network: string) {
  return `partna:${currency}:${network}`;
}

function buildPartnaNetworkId(network: string) {
  return `partna-network:${network}`;
}

function getPartnaChannelType(network: string) {
  return network === "mobilemoney" || network === "mpesa"
    ? "mobile_money"
    : "bank_transfer";
}

function getPartnaNetworkName(network: string) {
  const networkNameMap: Record<string, string> = {
    ghanaiancedis: "Ghanaian Cedis",
    kenyanshilling: "Kenyan Shilling",
    mobilemoney: "Mobile money",
    mpesa: "M-Pesa",
    naira: "Naira",
  };

  return (
    networkNameMap[network] ??
    network
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
      .join(" ")
  );
}

function getPartnaPreferredAssetRank(network: string) {
  if (network === "naira" || network === "ghanaiancedis" || network === "kenyanshilling") {
    return 0;
  }

  if (network === "mobilemoney" || network === "mpesa") {
    return 1;
  }

  return 2;
}

async function listPartnaLocalAssets(environment: RuntimeMode) {
  const provider = getPartnaProvider(environment);
  const assets = await provider.listSupportedAssets();

  return assets.filter((asset) =>
    isPartnaLocalMarketAsset({
      currency: asset.currency,
      destinationCurrency: asset.destinationCurrency,
      network: asset.network,
    })
  );
}

async function listPartnaCollectionMarketCatalog(environment: RuntimeMode) {
  const localAssets = await listPartnaLocalAssets(environment);

  const marketsByCurrency = new Map<
    string,
    {
      currency: string;
      currencyName: string;
      symbol: string;
      countryCodes: Set<string>;
      countries: Set<string>;
      channelTypes: Set<string>;
      min: number | null;
      max: number | null;
      estimatedSettlementTime: number | null;
    }
  >();

  for (const asset of localAssets) {
    const marketMetadata = getPartnaMarketMetadata(asset.currency, asset.symbol);
    const existing = marketsByCurrency.get(asset.currency) ?? {
      currency: asset.currency,
      currencyName: marketMetadata.currencyName,
      symbol: marketMetadata.symbol,
      countryCodes: new Set<string>(),
      countries: new Set<string>(),
      channelTypes: new Set<string>(),
      min: null as number | null,
      max: null as number | null,
      estimatedSettlementTime: null as number | null,
    };

    for (const countryCode of marketMetadata.countryCodes) {
      existing.countryCodes.add(countryCode);
    }

    for (const country of marketMetadata.countries) {
      existing.countries.add(country);
    }

    existing.channelTypes.add(getPartnaChannelType(asset.network));
    existing.min =
      existing.min === null
        ? asset.minimumWithdrawal
        : asset.minimumWithdrawal === null
          ? existing.min
          : Math.min(existing.min, asset.minimumWithdrawal);

    marketsByCurrency.set(asset.currency, existing);
  }

  return [...marketsByCurrency.values()]
    .sort((left, right) => left.currency.localeCompare(right.currency))
    .map((entry) => ({
      currency: entry.currency,
      currencyName: entry.currencyName,
      symbol: entry.symbol,
      countryCodes: [...entry.countryCodes].sort(),
      countries: [...entry.countries].sort(),
      channelTypes: [...entry.channelTypes].sort(),
      min: entry.min,
      max: entry.max,
      estimatedSettlementTime: entry.estimatedSettlementTime,
    }));
}

export async function assertSupportedCollectionMarkets(input: {
  markets: string[];
  environment: RuntimeMode;
}) {
  const catalog = await listCollectionMarketCatalog(input.environment);
  const supported = new Set(catalog.map((entry) => entry.currency));
  const unsupported = input.markets.filter((market) => !supported.has(market));

  if (unsupported.length > 0) {
    throw new HttpError(
      409,
      `Unsupported Partna collection markets: ${unsupported.join(", ")}.`
    );
  }
}

async function getPreferredPartnaMarketAsset(
  currency: string,
  environment: RuntimeMode
) {
  const matches = (await listPartnaLocalAssets(environment))
    .filter((asset) => asset.currency === currency)
    .sort(
      (left, right) =>
        getPartnaPreferredAssetRank(left.network) -
        getPartnaPreferredAssetRank(right.network)
    );

  if (matches.length === 0) {
    throw new HttpError(
      404,
      `Partna does not currently expose a collection market for ${currency}.`
    );
  }

  return matches[0]!;
}

async function createPartnaWidgetQuote(input: CreateWidgetQuoteInput) {
  if (input.coin.trim().toUpperCase() !== "USDC") {
    throw new HttpError(400, "Partna quotes currently support USDC settlement only.");
  }

  if (input.network.trim().toUpperCase() !== "SOLANA") {
    throw new HttpError(
      400,
      "Partna quotes currently support SOLANA settlement only."
    );
  }

  const provider = getPartnaProvider(input.environment);
  const marketAsset = await getPreferredPartnaMarketAsset(
    input.currency,
    input.environment
  );
  const rateQuote = await provider.getRate({
    fromCurrency:
      input.localAmount !== undefined
        ? input.currency
        : input.coin.trim().toUpperCase(),
    toCurrency:
      input.localAmount !== undefined
        ? input.coin.trim().toUpperCase()
        : input.currency,
    ...(input.localAmount !== undefined
      ? { fromAmount: input.localAmount }
      : { fromAmount: input.cryptoAmount }),
  });
  const localAmount =
    rateQuote.fromCurrency === input.currency
      ? rateQuote.fromAmount
      : rateQuote.toAmount;
  const cryptoAmount =
    rateQuote.fromCurrency === input.coin.trim().toUpperCase()
      ? rateQuote.fromAmount
      : rateQuote.toAmount;
  const fxRate = localAmount > 0 && cryptoAmount > 0 ? localAmount / cryptoAmount : 0;

  return {
    channelId: buildPartnaChannelId(input.currency, marketAsset.network),
    convertedAmount: Number(localAmount.toFixed(2)),
    cryptoAmount: Number(cryptoAmount.toFixed(4)),
    rateLocal: Number(fxRate.toFixed(4)),
    serviceFeeUSD: 0,
    partnerFeeUSD: 0,
    expireAt: null,
    expiresAt: null,
    rateKey: rateQuote.key,
    provider: "partna" as const,
    paymentNetwork: marketAsset.network,
    raw: rateQuote.raw,
  };
}

async function ensurePaymentRailsSeeded(environment: RuntimeMode) {
  const activeChannelFilter = {
    ...createRuntimeModeCondition("environment", environment),
    status: "active",
    widgetStatus: "active",
    apiStatus: "active",
  };
  const activeNetworkFilter = {
    ...createRuntimeModeCondition("environment", environment),
    status: "active",
  };

  const [activeChannelCount, activeNetworkCount] = await Promise.all([
    ChannelModel.countDocuments(activeChannelFilter).exec(),
    NetworkModel.countDocuments(activeNetworkFilter).exec(),
  ]);

  if (activeChannelCount === 0) {
    await syncChannels({ environment });
  }

  if (activeNetworkCount === 0) {
    await syncNetworks({ environment });
  }
}

function toChannelResponse(document: {
  _id: { toString(): string };
  externalId: string;
  environment?: string;
  country: string;
  currency: string;
  countryCurrency: string;
  status: string;
  widgetStatus: string;
  apiStatus: string;
  channelType: string;
  rampType: string;
  settlementType: string;
  estimatedSettlementTime: number;
  min: number;
  max: number;
  widgetMin?: number | null;
  widgetMax?: number | null;
  feeLocal: number;
  feeUSD: number;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    externalId: document.externalId,
    environment: document.environment === "live" ? "live" : "test",
    country: document.country,
    currency: document.currency,
    countryCurrency: document.countryCurrency,
    status: document.status,
    widgetStatus: document.widgetStatus,
    apiStatus: document.apiStatus,
    channelType: document.channelType,
    rampType: document.rampType,
    settlementType: document.settlementType,
    estimatedSettlementTime: document.estimatedSettlementTime,
    min: document.min,
    max: document.max,
    widgetMin: document.widgetMin ?? null,
    widgetMax: document.widgetMax ?? null,
    feeLocal: document.feeLocal,
    feeUSD: document.feeUSD,
    lastSyncedAt: document.lastSyncedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toNetworkResponse(document: {
  _id: { toString(): string };
  externalId: string;
  environment?: string;
  code?: string | null;
  country: string;
  name: string;
  status: string;
  accountNumberType?: string | null;
  countryAccountNumberType?: string | null;
  channelIds: string[];
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    externalId: document.externalId,
    environment: document.environment === "live" ? "live" : "test",
    code: document.code ?? null,
    country: document.country,
    name: document.name,
    status: document.status,
    accountNumberType: document.accountNumberType ?? null,
    countryAccountNumberType: document.countryAccountNumberType ?? null,
    channelIds: document.channelIds,
    lastSyncedAt: document.lastSyncedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function mapPartnaChannelDocument(asset: PartnaSupportedAsset, environment: RuntimeMode) {
  const marketMetadata = getPartnaMarketMetadata(asset.currency, asset.symbol);
  const country = marketMetadata.countryCodes[0] ?? asset.currency;

  return {
    externalId: buildPartnaChannelId(asset.currency, asset.network),
    environment,
    country,
    currency: asset.currency,
    countryCurrency: asset.currency,
    status: "active",
    widgetStatus: "active",
    apiStatus: "active",
    channelType: getPartnaChannelType(asset.network),
    rampType: "fiat_to_stable",
    settlementType: "stablecoin",
    estimatedSettlementTime: 0,
    min: asset.minimumWithdrawal ?? 0,
    max: Number.MAX_SAFE_INTEGER,
    widgetMin: asset.minimumWithdrawal ?? null,
    widgetMax: null,
    feeLocal: 0,
    feeUSD: 0,
    raw: asset.raw,
    lastSyncedAt: new Date(),
  };
}

function getPartnaAccountNumberType(network: string) {
  return network === "mobilemoney" || network === "mpesa"
    ? "phone_number"
    : "account_number";
}

function groupPartnaNetworks(assets: PartnaSupportedAsset[], environment: RuntimeMode) {
  const networksById = new Map<
    string,
    {
      externalId: string;
      environment: RuntimeMode;
      code: string;
      country: string;
      name: string;
      status: string;
      accountNumberType: string;
      countryAccountNumberType: string;
      channelIds: Set<string>;
      raw: PartnaSupportedAsset[];
      lastSyncedAt: Date;
    }
  >();

  for (const asset of assets) {
    const marketMetadata = getPartnaMarketMetadata(asset.currency, asset.symbol);
    const externalId = buildPartnaNetworkId(asset.network);
    const existing = networksById.get(externalId) ?? {
      externalId,
      environment,
      code: asset.network,
      country: marketMetadata.countryCodes[0] ?? asset.currency,
      name: getPartnaNetworkName(asset.network),
      status: "active",
      accountNumberType: getPartnaAccountNumberType(asset.network),
      countryAccountNumberType: getPartnaAccountNumberType(asset.network),
      channelIds: new Set<string>(),
      raw: [],
      lastSyncedAt: new Date(),
    };

    existing.channelIds.add(buildPartnaChannelId(asset.currency, asset.network));
    existing.raw.push(asset);
    networksById.set(externalId, existing);
  }

  return [...networksById.values()];
}

export async function listChannels(query: ListChannelsQuery) {
  await ensurePaymentRailsSeeded(query.environment);
  const mongoQuery: Record<string, unknown> = {};

  if (query.environment) {
    Object.assign(mongoQuery, createRuntimeModeCondition("environment", query.environment));
  }

  if (query.country) {
    mongoQuery.country = query.country;
  }

  if (query.currency) {
    mongoQuery.currency = query.currency;
  }

  if (query.channelType) {
    mongoQuery.channelType = query.channelType;
  }

  if (query.rampType) {
    mongoQuery.rampType = query.rampType;
  }

  if (!query.includeInactive) {
    mongoQuery.status = "active";
    mongoQuery.widgetStatus = "active";
    mongoQuery.apiStatus = "active";
  }

  const channels = await ChannelModel.find(mongoQuery)
    .sort({ country: 1, currency: 1, channelType: 1 })
    .exec();

  return channels.map(toChannelResponse);
}

export async function listNetworks(query: ListNetworksQuery) {
  await ensurePaymentRailsSeeded(query.environment);
  const mongoQuery: Record<string, unknown> = {};

  if (query.environment) {
    Object.assign(mongoQuery, createRuntimeModeCondition("environment", query.environment));
  }

  if (query.country) {
    mongoQuery.country = query.country;
  }

  if (!query.includeInactive) {
    mongoQuery.status = "active";
  }

  if (query.channelId) {
    mongoQuery.channelIds = query.channelId;
  }

  const networks = await NetworkModel.find(mongoQuery)
    .sort({ country: 1, name: 1 })
    .exec();

  return networks.map(toNetworkResponse);
}

export async function syncChannels(input: SyncPaymentRailInput) {
  const requestedCountry = input.country?.trim().toUpperCase();
  const assets = (await listPartnaLocalAssets(input.environment)).filter((asset) => {
    if (!requestedCountry) {
      return true;
    }

    const marketMetadata = getPartnaMarketMetadata(asset.currency, asset.symbol);
    return marketMetadata.countryCodes.includes(requestedCountry);
  });

  const operations = assets.map((asset) => {
    const channelDocument = mapPartnaChannelDocument(asset, input.environment);

    return ChannelModel.findOneAndUpdate(
      {
        externalId: channelDocument.externalId,
        ...createRuntimeModeCondition("environment", input.environment),
      },
      channelDocument,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).exec();
  });

  const synced = await Promise.all(operations);

  return synced.map(toChannelResponse);
}

export async function syncNetworks(input: SyncPaymentRailInput) {
  const requestedCountry = input.country?.trim().toUpperCase();
  const assets = (await listPartnaLocalAssets(input.environment)).filter((asset) => {
    if (!requestedCountry) {
      return true;
    }

    const marketMetadata = getPartnaMarketMetadata(asset.currency, asset.symbol);
    return marketMetadata.countryCodes.includes(requestedCountry);
  });
  const networks = groupPartnaNetworks(assets, input.environment);

  const operations = networks.map((network) =>
    NetworkModel.findOneAndUpdate(
      {
        externalId: network.externalId,
        ...createRuntimeModeCondition("environment", input.environment),
      },
      {
        ...network,
        channelIds: [...network.channelIds],
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).exec()
  );

  const synced = await Promise.all(operations);

  return synced.map(toNetworkResponse);
}

export async function createWidgetQuote(input: CreateWidgetQuoteInput) {
  return {
    ...(await createPartnaWidgetQuote(input)),
    settlementAsset: "USDC",
    settlementNetwork: "SOLANA",
  };
}

export async function listCollectionMarketCatalog(environment: RuntimeMode = "test") {
  return listPartnaCollectionMarketCatalog(environment);
}

export async function enqueuePaymentRailSync(input: SyncPaymentRailInput) {
  const queuedJob = await enqueueQueueJob(
    queueNames.paymentRailSync,
    "sync-payment-rails",
    input,
    {
      jobId: `payment-rail-sync-${input.environment}-${input.country ?? "all"}-${Math.floor(
        Date.now() / 60000
      )}`,
    }
  );

  if (!queuedJob) {
    const inlineResult = await runPaymentRailSyncJob(input);

    return {
      queued: false,
      processedInline: true,
      scope: input.country ?? "all",
      result: inlineResult,
    };
  }

  return {
    queued: true,
    scope: input.country ?? "all",
  };
}

export async function runPaymentRailSyncJob(input: SyncPaymentRailInput) {
  const [channels, networks] = await Promise.all([
    syncChannels(input),
    syncNetworks(input),
  ]);

  return {
    channels: channels.length,
    networks: networks.length,
    scope: input.country ?? "all",
  };
}

export async function quoteUsdAmountInCollectionCurrency(input: {
  environment: RuntimeMode;
  currency: string;
  usdAmount: number;
}) {
  const marketAsset = await getPreferredPartnaMarketAsset(
    input.currency,
    input.environment
  );
  const quote = (await createWidgetQuote({
    environment: input.environment,
    currency: input.currency,
    cryptoAmount: input.usdAmount,
    channelId: buildPartnaChannelId(input.currency, marketAsset.network),
    coin: "USDC",
    network: "SOLANA",
    transactionType: "Buy",
  })) as Record<string, unknown>;
  const localAmount = toSafeNumber(
    quote.convertedAmount,
    Number(input.usdAmount.toFixed(2))
  );
  const usdcAmount = Number(
    Math.max(0.01, toSafeNumber(quote.cryptoAmount, input.usdAmount)).toFixed(4)
  );
  const fxRate = Number(
    Math.max(
      0.0001,
      localAmount > 0 ? localAmount / usdcAmount : input.usdAmount
    ).toFixed(4)
  );
  const feeAmount = Number(
    (
      toSafeNumber(quote.serviceFeeUSD) + toSafeNumber(quote.partnerFeeUSD)
    ).toFixed(2)
  );
  const marketMetadata = getPartnaMarketMetadata(input.currency, marketAsset.symbol);

  return {
    currency: input.currency,
    localAmount,
    usdcAmount,
    fxRate,
    feeAmount,
    expiresAt: null,
    settlementAsset: "USDC" as const,
    settlementNetwork: "SOLANA" as const,
    channel: {
      externalId: buildPartnaChannelId(input.currency, marketAsset.network),
      country: marketMetadata.countryCodes[0] ?? input.currency,
      channelType: getPartnaChannelType(marketAsset.network),
      estimatedSettlementTime: 0,
      min: marketAsset.minimumWithdrawal ?? 0,
      max: Number.MAX_SAFE_INTEGER,
    },
    network: {
      externalId: buildPartnaNetworkId(marketAsset.network),
      name: getPartnaNetworkName(marketAsset.network),
      country: marketMetadata.countryCodes[0] ?? input.currency,
      accountNumberType: getPartnaAccountNumberType(marketAsset.network),
    },
    raw: quote,
  };
}
