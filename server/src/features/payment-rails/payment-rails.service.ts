import { HttpError } from "@/shared/errors/http-error";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";

import { getDefaultPaymentRailProvider } from "@/config/payment-rail.config";
import { ChargeModel } from "@/features/charges/charge.model";
import { CustomerModel } from "@/features/customers/customer.model";
import { emitChargeWebhookEventForStatusChange } from "@/features/developers/developer-webhook-delivery.service";
import { queueChargeStatusNotifications } from "@/features/notifications/notification.service";
import { PaymentRailEventModel } from "@/features/payment-rails/payment-rail-event.model";
import { ChannelModel } from "@/features/payment-rails/channel.model";
import { NetworkModel } from "@/features/payment-rails/network.model";
import { getPartnaProvider } from "@/features/payment-rails/providers/partna/partna.factory";
import { PlanModel } from "@/features/plans/plan.model";
import { recordProtocolChargeFailure } from "@/features/protocol/protocol.settlement";
import { SettlementModel } from "@/features/settlements/settlement.model";
import { queueSettlementBridge } from "@/features/settlements/settlement.service";
import { SubscriptionModel } from "@/features/subscriptions/subscription.model";
import type {
  CreateWidgetQuoteInput,
  ListChannelsQuery,
  ListNetworksQuery,
  ResolveBankAccountInput,
  SyncPaymentRailInput,
  YellowCardWebhookInput,
} from "@/features/payment-rails/payment-rails.validation";
import { getYellowCardProvider } from "@/features/payment-rails/providers/yellow-card/yellow-card.factory";
import {
  getSimulatedYellowCardCurrencyMetadata,
  listSimulatedYellowCardMarkets,
} from "@/features/payment-rails/providers/yellow-card/yellow-card.simulated-catalog";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import {
  createRuntimeModeCondition,
  toStoredRuntimeMode,
} from "@/shared/utils/runtime-environment";

function toSafeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function resolveChargeStatusFromSettlement(settlementStatus: string) {
  switch (settlementStatus) {
    case "queued":
      return "awaiting_settlement" as const;
    case "confirming":
      return "confirming" as const;
    case "settled":
      return "settled" as const;
    case "reversed":
      return "reversed" as const;
    default:
      return "failed" as const;
  }
}

async function syncCustomerSubscriptionSummary(input: {
  merchantId: string;
  customerRef: string;
  environment: RuntimeMode;
}) {
  const activeSubscriptions = await SubscriptionModel.find({
    merchantId: input.merchantId,
    customerRef: input.customerRef,
    status: "active",
    ...createRuntimeModeCondition("environment", input.environment),
  })
    .select({ nextChargeAt: 1, lastChargeAt: 1 })
    .lean()
    .exec();

  let nextRenewalAt: Date | null = null;
  let lastChargeAt: Date | null = null;

  for (const subscription of activeSubscriptions) {
    if (
      subscription.nextChargeAt instanceof Date &&
      (!nextRenewalAt || subscription.nextChargeAt.getTime() < nextRenewalAt.getTime())
    ) {
      nextRenewalAt = subscription.nextChargeAt;
    }

    if (
      subscription.lastChargeAt instanceof Date &&
      (!lastChargeAt || subscription.lastChargeAt.getTime() > lastChargeAt.getTime())
    ) {
      lastChargeAt = subscription.lastChargeAt;
    }
  }

  await CustomerModel.findOneAndUpdate(
    {
      merchantId: input.merchantId,
      customerRef: input.customerRef,
      ...createRuntimeModeCondition("environment", input.environment),
    },
    {
      $set: {
        subscriptionCount: activeSubscriptions.length,
        nextRenewalAt,
        lastChargeAt,
      },
    }
  ).exec();
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

function usePartnaPaymentRail(environment: RuntimeMode) {
  return getDefaultPaymentRailProvider(environment) === "partna";
}

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

function getPartnaMarketMetadata(currency: string, fallbackSymbol?: string) {
  const metadata = getPartnaCountryMetadata(currency);

  return {
    currencyName: metadata.currencyName,
    symbol: metadata.symbol ?? fallbackSymbol ?? currency,
    countryCodes: metadata.countryCodes,
    countries: metadata.countries,
  };
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

async function listPartnaBillingMarketCatalog(environment: RuntimeMode) {
  const provider = getPartnaProvider(environment);
  const assets = await provider.listSupportedAssets();
  const localAssets = assets.filter((asset) =>
    isPartnaLocalMarketAsset({
      currency: asset.currency,
      destinationCurrency: asset.destinationCurrency,
      network: asset.network,
    })
  );

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

export async function assertSupportedBillingMarkets(input: {
  markets: string[];
  environment: RuntimeMode;
}) {
  const catalog = await listBillingMarketCatalog(input.environment);
  const supported = new Set(catalog.map((entry) => entry.currency));
  const unsupported = input.markets.filter((market) => !supported.has(market));

  if (unsupported.length > 0) {
    throw new HttpError(
      409,
      `Unsupported billing markets for ${usePartnaPaymentRail(input.environment) ? "Partna" : "the active payment rail"}: ${unsupported.join(", ")}.`
    );
  }
}

async function getPreferredPartnaMarketAsset(
  currency: string,
  environment: RuntimeMode
) {
  const provider = getPartnaProvider(environment);
  const assets = await provider.listSupportedAssets();
  const matches = assets
    .filter(
      (asset) =>
        asset.currency === currency &&
        isPartnaLocalMarketAsset({
          currency: asset.currency,
          destinationCurrency: asset.destinationCurrency,
          network: asset.network,
        })
    )
    .sort(
      (left, right) =>
        getPartnaPreferredAssetRank(left.network) -
        getPartnaPreferredAssetRank(right.network)
    );

  if (matches.length === 0) {
    throw new HttpError(
      404,
      `Partna does not currently expose a billing market for ${currency}.`
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

function toProtocolFailureCode(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return (normalized || "COLLECTION_FAILED").slice(0, 32);
}

async function ensureSandboxPaymentRailsSeeded(environment: RuntimeMode) {
  if (environment !== "test") {
    return;
  }

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

export async function listChannels(query: ListChannelsQuery) {
  await ensureSandboxPaymentRailsSeeded(query.environment);
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
  await ensureSandboxPaymentRailsSeeded(query.environment);
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
  const yellowCardProvider = getYellowCardProvider(input.environment);
  const channels = await yellowCardProvider.getChannels(input.country);

  const operations = channels.map((channel) =>
    ChannelModel.findOneAndUpdate(
      {
        externalId: channel.id,
        ...createRuntimeModeCondition("environment", input.environment),
      },
      {
        externalId: channel.id,
        environment: input.environment,
        country: channel.country,
        currency: channel.currency,
        countryCurrency: channel.countryCurrency,
        status: channel.status,
        widgetStatus: channel.widgetStatus ?? channel.status,
        apiStatus: channel.apiStatus ?? channel.status,
        channelType: channel.channelType,
        rampType: channel.rampType,
        settlementType: channel.settlementType ?? "standard",
        estimatedSettlementTime: channel.estimatedSettlementTime ?? 0,
        min: channel.min ?? 0,
        max: channel.max ?? 0,
        widgetMin: channel.widgetMin ?? null,
        widgetMax: channel.widgetMax ?? null,
        feeLocal: channel.feeLocal ?? 0,
        feeUSD: channel.feeUSD ?? 0,
        raw: channel,
        lastSyncedAt: new Date(),
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    )
  );

  const synced = await Promise.all(operations);

  return synced.map(toChannelResponse);
}

export async function syncNetworks(input: SyncPaymentRailInput) {
  const yellowCardProvider = getYellowCardProvider(input.environment);
  const networks = await yellowCardProvider.getNetworks(input.country);

  const operations = networks.map((network) =>
    NetworkModel.findOneAndUpdate(
      {
        externalId: network.id,
        ...createRuntimeModeCondition("environment", input.environment),
      },
      {
        externalId: network.id,
        environment: input.environment,
        code: network.code ?? null,
        country: network.country,
        name: network.name,
        status: network.status,
        accountNumberType: network.accountNumberType ?? null,
        countryAccountNumberType: network.countryAccountNumberType ?? null,
        channelIds: network.channelIds ?? [],
        raw: network,
        lastSyncedAt: new Date(),
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    )
  );

  const synced = await Promise.all(operations);

  return synced.map(toNetworkResponse);
}

export async function createWidgetQuote(input: CreateWidgetQuoteInput) {
  if (usePartnaPaymentRail(input.environment)) {
    return {
      ...(await createPartnaWidgetQuote(input)),
      settlementAsset: "USDC",
      settlementNetwork: "SOLANA",
    };
  }

  await ensureSandboxPaymentRailsSeeded(input.environment);
  const yellowCardProvider = getYellowCardProvider(input.environment);
  const activeChannel = await ChannelModel.findOne({
    externalId: input.channelId,
    ...createRuntimeModeCondition("environment", input.environment),
    status: "active",
    widgetStatus: "active",
    apiStatus: "active",
  }).exec();

  if (!activeChannel) {
    throw new HttpError(
      404,
      "Active payment channel was not found for the requested quote."
    );
  }

  const quote = await yellowCardProvider.getWidgetQuote(input);

  return {
    ...quote,
    settlementAsset: "USDC",
    settlementNetwork: "SOLANA",
  };
}

export async function listBillingMarketCatalog(environment: RuntimeMode = "test") {
  if (usePartnaPaymentRail(environment)) {
    return listPartnaBillingMarketCatalog(environment);
  }

  await ensureSandboxPaymentRailsSeeded(environment);

  const countryNameByCode = new Map(
    listSimulatedYellowCardMarkets().map((entry) => [entry.countryCode, entry.countryName])
  );
  const channels = await ChannelModel.find({
    ...createRuntimeModeCondition("environment", environment),
    status: "active",
    widgetStatus: "active",
    apiStatus: "active",
  })
    .sort({ currency: 1, country: 1, estimatedSettlementTime: 1, feeUSD: 1 })
    .lean()
    .exec();

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

  for (const channel of channels) {
    const metadata = getSimulatedYellowCardCurrencyMetadata(channel.currency);
    const existing = marketsByCurrency.get(channel.currency) ?? {
      currency: channel.currency,
      currencyName: metadata?.currencyName ?? channel.currency,
      symbol: metadata?.symbol ?? channel.currency,
      countryCodes: new Set<string>(),
      countries: new Set<string>(),
      channelTypes: new Set<string>(),
      min: null as number | null,
      max: null as number | null,
      estimatedSettlementTime: null as number | null,
    };

    existing.countryCodes.add(channel.country);
    existing.countries.add(countryNameByCode.get(channel.country) ?? channel.country);
    existing.channelTypes.add(channel.channelType);
    existing.min =
      existing.min === null
        ? (channel.widgetMin ?? channel.min ?? null)
        : Math.min(existing.min, channel.widgetMin ?? channel.min ?? existing.min);
    existing.max =
      existing.max === null
        ? (channel.widgetMax ?? channel.max ?? null)
        : Math.max(existing.max, channel.widgetMax ?? channel.max ?? existing.max);
    existing.estimatedSettlementTime =
      existing.estimatedSettlementTime === null
        ? (channel.estimatedSettlementTime ?? null)
        : Math.min(
          existing.estimatedSettlementTime,
          channel.estimatedSettlementTime ?? existing.estimatedSettlementTime
        );

    marketsByCurrency.set(channel.currency, existing);
  }

  return [...marketsByCurrency.values()].map((entry) => ({
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

export async function resolveBankAccount(input: ResolveBankAccountInput) {
  const yellowCardProvider = getYellowCardProvider(input.environment);
  const network = await NetworkModel.findOne({
    externalId: input.networkId,
    ...createRuntimeModeCondition("environment", input.environment),
    status: "active",
  }).exec();

  if (!network) {
    throw new HttpError(404, "Network was not found or is inactive.");
  }

  const result = await yellowCardProvider.resolveBankAccount(input);

  return {
    ...result,
    networkName: network.name,
  };
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

export async function getPreferredCollectionChannel(
  currency: string,
  environment: RuntimeMode = "test"
) {
  await ensureSandboxPaymentRailsSeeded(environment);
  const channel = await ChannelModel.findOne({
    ...createRuntimeModeCondition("environment", environment),
    currency,
    status: "active",
    widgetStatus: "active",
    apiStatus: "active",
  })
    .sort({ estimatedSettlementTime: 1, feeUSD: 1 })
    .exec();

  if (!channel) {
    throw new HttpError(
      404,
      `No active payment rail was found for currency ${currency}.`
    );
  }

  return channel;
}

export async function getPreferredCollectionNetwork(
  channelId: string,
  country?: string,
  environment: RuntimeMode = "test"
) {
  await ensureSandboxPaymentRailsSeeded(environment);
  const mongoQuery: Record<string, unknown> = {
    ...createRuntimeModeCondition("environment", environment),
    status: "active",
    channelIds: channelId,
  };

  if (country) {
    mongoQuery.country = country;
  }

  const network = await NetworkModel.findOne(mongoQuery).sort({ name: 1 }).exec();

  return network;
}

export async function quoteUsdAmountInBillingCurrency(input: {
  environment: RuntimeMode;
  currency: string;
  usdAmount: number;
}) {
  if (usePartnaPaymentRail(input.environment)) {
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
      Math.max(0.0001, localAmount > 0 ? localAmount / usdcAmount : input.usdAmount).toFixed(4)
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
        accountNumberType:
          marketAsset.network === "mobilemoney" || marketAsset.network === "mpesa"
            ? "phone_number"
            : "account_number",
      },
      raw: quote,
    };
  }

  const channel = await getPreferredCollectionChannel(input.currency, input.environment);
  const network = await getPreferredCollectionNetwork(
    channel.externalId,
    channel.country,
    input.environment
  ).catch(() => null);
  const quote = (await createWidgetQuote({
    environment: input.environment,
    currency: input.currency,
    cryptoAmount: input.usdAmount,
    channelId: channel.externalId,
    coin: "USDC",
    network: "SOLANA",
    transactionType: "Buy",
  })) as Record<string, unknown>;

  const localAmount = toSafeNumber(
    quote.convertedAmount,
    Number((input.usdAmount * 1).toFixed(2))
  );
  const usdcAmount = Number(
    Math.max(0.01, toSafeNumber(quote.cryptoAmount, input.usdAmount)).toFixed(4)
  );
  const fxRate = Number(
    Math.max(
      0.0001,
      toSafeNumber(quote.rateLocal, localAmount > 0 ? localAmount / usdcAmount : input.usdAmount)
    ).toFixed(4)
  );
  const feeAmount = Number(
    (
      toSafeNumber(quote.serviceFeeUSD) + toSafeNumber(quote.partnerFeeUSD)
    ).toFixed(2)
  );
  const expiresAt =
    typeof quote.expireAt === "string" || quote.expireAt instanceof Date
      ? new Date(quote.expireAt)
      : typeof quote.expiresAt === "string" || quote.expiresAt instanceof Date
        ? new Date(quote.expiresAt)
        : null;

  return {
    currency: input.currency,
    localAmount,
    usdcAmount,
    fxRate,
    feeAmount,
    expiresAt,
    settlementAsset: "USDC" as const,
    settlementNetwork: "SOLANA" as const,
    channel: {
      externalId: channel.externalId,
      country: channel.country,
      channelType: channel.channelType,
      estimatedSettlementTime: channel.estimatedSettlementTime,
      min: channel.widgetMin ?? channel.min,
      max: channel.widgetMax ?? channel.max,
    },
    network: network
      ? {
        externalId: network.externalId,
        name: network.name,
        country: network.country,
        accountNumberType: network.accountNumberType,
      }
      : null,
    raw: quote,
  };
}

export async function createCollectionRequest(input: {
  merchantId: string;
  environment: RuntimeMode;
  channelId: string;
  customerRef: string;
  customerName: string;
  localAmount: number;
  usdAmount: number;
  currency: string;
  country?: string;
  networkId?: string | null;
  accountType: "bank" | "momo";
  accountNumber?: string | null;
}) {
  const yellowCardProvider = getYellowCardProvider(input.environment);
  const sequenceId = `renew-${input.customerRef}-${Date.now()}`;

  return yellowCardProvider.submitCollectionRequest({
    channelId: input.channelId,
    sequenceId,
    amount: Number(input.usdAmount.toFixed(2)),
    localAmount: Math.round(input.localAmount),
    currency: input.currency,
    country: input.country,
    customerUID: input.customerRef,
    customerType: "institution",
    recipient: {
      businessId: input.customerRef,
      businessName: input.customerName,
    },
    source: {
      accountType: input.accountType,
      ...(input.accountNumber ? { accountNumber: input.accountNumber } : {}),
      ...(input.networkId ? { networkId: input.networkId } : {}),
    },
    forceAccept: true,
  });
}

export async function getCollectionRequest(
  collectionId: string,
  environment: RuntimeMode = "test"
) {
  const yellowCardProvider = getYellowCardProvider(environment);
  return yellowCardProvider.getCollectionById(collectionId);
}

export async function acceptCollectionRequest(
  collectionId: string,
  environment: RuntimeMode = "test"
) {
  const yellowCardProvider = getYellowCardProvider(environment);
  return yellowCardProvider.acceptCollectionRequest(collectionId);
}

export async function denyCollectionRequest(
  collectionId: string,
  environment: RuntimeMode = "test"
) {
  const yellowCardProvider = getYellowCardProvider(environment);
  return yellowCardProvider.denyCollectionRequest(collectionId);
}

function readWebhookValue<T = unknown>(
  payload: YellowCardWebhookInput,
  key: string
): T | undefined {
  const primary = payload[key as keyof YellowCardWebhookInput];

  if (primary !== undefined) {
    return primary as T;
  }

  const dataValue = payload.data?.[key];

  if (dataValue !== undefined) {
    return dataValue as T;
  }

  const nestedPayloadValue = payload.payload?.[key];

  if (nestedPayloadValue !== undefined) {
    return nestedPayloadValue as T;
  }

  const collectionValue = payload.collection?.[key];

  if (collectionValue !== undefined) {
    return collectionValue as T;
  }

  return undefined;
}

function normalizeWebhookState(payload: YellowCardWebhookInput) {
  const value =
    readWebhookValue<string>(payload, "state") ??
    readWebhookValue<string>(payload, "event") ??
    readWebhookValue<string>(payload, "status");

  return value?.trim().toLowerCase() ?? "unknown";
}

function buildWebhookEventKey(
  payload: YellowCardWebhookInput,
  state: string,
  environment: RuntimeMode
) {
  const sequenceId = readWebhookValue<string>(payload, "sequenceId") ?? "none";
  const externalId = readWebhookValue<string>(payload, "id") ?? "none";
  const event = readWebhookValue<string>(payload, "event") ?? "none";
  const status = readWebhookValue<string>(payload, "status") ?? "none";
  const timestamp =
    readWebhookValue<string>(payload, "updatedAt") ??
    readWebhookValue<string>(payload, "createdAt") ??
    "none";

  return `yellow-card:${environment}:${sequenceId}:${externalId}:${state}:${event}:${status}:${timestamp}`;
}

export async function processYellowCardWebhook(
  input: YellowCardWebhookInput,
  environmentHint?: RuntimeMode
) {
  const environment =
    environmentHint ??
    optionalEnvironmentFromPayload(input) ??
    "test";
  const state = normalizeWebhookState(input);
  const eventKey = buildWebhookEventKey(input, state, environment);
  const existingEvent = await PaymentRailEventModel.findOne({
    provider: "yellow-card",
    environment,
    eventKey,
  }).exec();

  if (existingEvent && existingEvent.processedAt) {
    return {
      processed: true,
      idempotent: true,
      matched: Boolean(existingEvent.result),
      state,
      externalChargeId:
        readWebhookValue<string>(input, "sequenceId") ??
        readWebhookValue<string>(input, "id") ??
        null,
    };
  }

  let webhookEvent = existingEvent;

  if (!webhookEvent) {
    try {
      webhookEvent = await PaymentRailEventModel.create({
        provider: "yellow-card",
        environment,
        eventKey,
        state,
        externalId: readWebhookValue<string>(input, "id") ?? null,
        sequenceId: readWebhookValue<string>(input, "sequenceId") ?? null,
        payload: input,
      });
    } catch (error) {
      const duplicateKeyError =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        Number((error as { code?: number }).code) === 11000;

      if (!duplicateKeyError) {
        throw error;
      }

      const duplicateEvent = await PaymentRailEventModel.findOne({
        provider: "yellow-card",
        environment,
        eventKey,
      }).exec();

      return {
        processed: true,
        idempotent: true,
        matched: Boolean(duplicateEvent?.result),
        state,
        externalChargeId:
          readWebhookValue<string>(input, "sequenceId") ??
          readWebhookValue<string>(input, "id") ??
          null,
      };
    }
  }

  const sequenceId = readWebhookValue<string>(input, "sequenceId");
  const externalId = readWebhookValue<string>(input, "id");
  const charge =
    (sequenceId
      ? await ChargeModel.findOne({
        externalChargeId: sequenceId,
        ...createRuntimeModeCondition("environment", environment),
      }).exec()
      : null) ??
    (externalId
      ? await ChargeModel.findOne({
        externalChargeId: externalId,
        ...createRuntimeModeCondition("environment", environment),
      }).exec()
      : null);

  if (!charge) {
    if (webhookEvent) {
      webhookEvent.result = {
        processed: false,
        matched: false,
        state,
        externalChargeId: sequenceId ?? externalId ?? null,
      };
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
    }

    return {
      processed: false,
      idempotent: false,
      matched: false,
      state,
      externalChargeId: sequenceId ?? externalId ?? null,
    };
  }

  const linkedSettlement = await SettlementModel.findOne({
    sourceChargeId: charge._id,
    ...createRuntimeModeCondition(
      "environment",
      toStoredRuntimeMode(charge.environment)
    ),
  })
    .sort({ createdAt: -1 })
    .exec();

  const now = new Date();
  const previousChargeStatus = charge.status;
  let nextChargeStatus = charge.status;
  let nextFailureCode = charge.failureCode ?? null;
  let finalSettlement = linkedSettlement;

  if (
    state.includes("failed") ||
    state.includes("deny") ||
    state.includes("cancel") ||
    state.includes("expired")
  ) {
    nextChargeStatus = "failed";
    nextFailureCode = state;

    if (linkedSettlement && linkedSettlement.status !== "settled") {
      linkedSettlement.status = "failed";
      linkedSettlement.settledAt = null;
      await linkedSettlement.save();
    }

    const subscription = await SubscriptionModel.findById(charge.subscriptionId).exec();
    const plan = subscription ? await PlanModel.findById(subscription.planId).exec() : null;

    if (subscription && plan) {
      subscription.status = "past_due";
      subscription.retryAvailableAt = new Date(
        now.getTime() + plan.retryWindowHours * 60 * 60 * 1000
      );
      await subscription.save();

      if (
        subscription.protocolSubscriptionId &&
        subscription.protocolSyncStatus === "synced" &&
        !charge.protocolTxHash &&
        charge.protocolSyncStatus !== "failed_recorded" &&
        charge.protocolSyncStatus !== "executed" &&
        charge.protocolSyncStatus !== "settlement_credited"
      ) {
        const protocolFailure = await recordProtocolChargeFailure({
          environment,
          protocolSubscriptionId: subscription.protocolSubscriptionId,
          externalChargeId: charge.externalChargeId,
          failureCode: toProtocolFailureCode(state),
        }).catch(() => null);

        if (protocolFailure) {
          charge.protocolChargeId = protocolFailure.protocolChargeId;
          charge.protocolSyncStatus = "failed_recorded";
          charge.protocolTxHash = protocolFailure.txHash;
        } else {
          charge.protocolSyncStatus = "protocol_error";
        }
      }
    }
  } else if (
    state.includes("complete") ||
    state.includes("accept") ||
    state.includes("success")
  ) {
    nextChargeStatus = linkedSettlement ? "awaiting_settlement" : "settled";
    nextFailureCode = null;

    if (linkedSettlement) {
      await queueSettlementBridge(linkedSettlement._id.toString(), {
        merchantId: linkedSettlement.merchantId.toString(),
        environment,
      });

      finalSettlement = await SettlementModel.findById(linkedSettlement._id).exec();
      nextChargeStatus = finalSettlement
        ? resolveChargeStatusFromSettlement(finalSettlement.status)
        : "settled";
    }

    if (previousChargeStatus !== "settled" && previousChargeStatus !== "awaiting_settlement") {
      const chargeSubscription = await SubscriptionModel.findById(charge.subscriptionId)
        .select({
          customerRef: 1,
          merchantId: 1,
          planId: 1,
          status: 1,
          pendingStatus: 1,
          protocolSyncStatus: 1,
          nextChargeAt: 1,
          lastChargeAt: 1,
          retryAvailableAt: 1,
        })
        .exec();

      if (chargeSubscription) {
        const metadata = (charge.providerMetadata ?? {}) as Record<string, unknown>;
        const checkoutSessionId =
          typeof metadata.checkoutSessionId === "string"
            ? metadata.checkoutSessionId.trim()
            : "";

        if (checkoutSessionId) {
          const plan = await PlanModel.findById(chargeSubscription.planId)
            .select({ billingIntervalDays: 1 })
            .lean()
            .exec();

          chargeSubscription.status = "active";
          chargeSubscription.pendingStatus = null;
          chargeSubscription.retryAvailableAt = null;
          chargeSubscription.lastChargeAt = now;
          chargeSubscription.nextChargeAt = addDays(
            now,
            Math.max(1, plan?.billingIntervalDays ?? 1)
          );
          await chargeSubscription.save();
        }

        await CustomerModel.findOneAndUpdate(
          {
            merchantId: chargeSubscription.merchantId,
            customerRef: chargeSubscription.customerRef,
          },
          {
            $inc: { monthlyVolumeUsdc: charge.usdcAmount },
          }
        ).exec();

        await syncCustomerSubscriptionSummary({
          merchantId: chargeSubscription.merchantId.toString(),
          customerRef: chargeSubscription.customerRef,
          environment,
        });
      }
    }
  } else if (
    state.includes("processing") ||
    state.includes("pending") ||
    state.includes("created")
  ) {
    if (charge.status !== "settled") {
      nextChargeStatus = "pending";
      nextFailureCode = null;
    }
  }

  charge.status = nextChargeStatus;
  charge.failureCode = nextFailureCode;
  charge.processedAt = now;
  await charge.save();
  await emitChargeWebhookEventForStatusChange({
    previousStatus: previousChargeStatus,
    chargeId: charge._id.toString(),
    nextStatus: charge.status,
  });
  await queueChargeStatusNotifications({
    chargeId: charge._id.toString(),
    previousStatus: previousChargeStatus,
    nextStatus: charge.status,
  }).catch(() => undefined);

  const result = {
    processed: true,
    idempotent: false,
    matched: true,
    state,
    chargeId: charge._id.toString(),
    chargeStatus: charge.status,
    settlementId: finalSettlement?._id.toString() ?? null,
    settlementStatus: finalSettlement?.status ?? null,
  };

  if (webhookEvent) {
    webhookEvent.result = result;
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();
  }

  return result;
}

function optionalEnvironmentFromPayload(
  payload: YellowCardWebhookInput
): RuntimeMode | null {
  const rawEnvironment = readWebhookValue<string>(payload, "environment");

  if (rawEnvironment === "live") {
    return "live";
  }

  if (rawEnvironment === "test") {
    return "test";
  }

  return null;
}
