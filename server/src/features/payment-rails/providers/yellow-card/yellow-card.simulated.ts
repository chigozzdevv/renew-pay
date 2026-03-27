import { getYellowCardConfig } from "@/config/yellow-card.config";
import { HttpError } from "@/shared/errors/http-error";
import type {
  YellowCardChannel,
  YellowCardCollectionRequestInput,
  YellowCardNetwork,
  YellowCardProvider,
} from "@/features/payment-rails/providers/yellow-card/yellow-card.types";
import type {
  CreateWidgetQuoteInput,
  ResolveBankAccountInput,
} from "@/features/payment-rails/payment-rails.validation";
import {
  getSimulatedYellowCardMarketByCurrency,
  listSimulatedYellowCardMarkets,
} from "@/features/payment-rails/providers/yellow-card/yellow-card.simulated-catalog";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

type MockCollectionRecord = {
  id: string;
  sequenceId: string;
  status: string;
  customerUID: string;
  channelId: string;
  currency: string;
  country: string;
  rate: number;
  convertedAmount: number;
  bankInfo?: {
    name: string;
    accountNumber: string;
    accountName: string;
  } | null;
  localAmount?: number | null;
  amount?: number | null;
  reference: string;
  depositId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

function hashToInt(seed: string) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function generateDigits(seed: string, size: number) {
  let value = hashToInt(seed).toString();

  while (value.length < size) {
    value = `${value}${hashToInt(`${value}:${seed}`)}`;
  }

  return value.slice(0, size);
}

function buildMockReference(seed: string) {
  return `YC-${generateDigits(`${seed}:ref`, 8)}`;
}

function buildMockDepositId(seed: string) {
  const left = generateDigits(`${seed}:left`, 8);
  const right = generateDigits(`${seed}:right`, 8);
  return `${left}-${right}`;
}

function inferMockSettlementStatus(
  accountNumber?: string
): "complete" | "processing" | "failed" | "denied" {
  if (!accountNumber) {
    return "processing";
  }

  if (accountNumber === "0000000000") {
    return "failed";
  }

  if (accountNumber === "9999999999") {
    return "denied";
  }

  if (accountNumber === "1111111111") {
    return "complete";
  }

  return "processing";
}

function buildMockChannels(country?: string): YellowCardChannel[] {
  return listSimulatedYellowCardMarkets(country).map((entry) => ({
    id: `yc-channel-${entry.countryCode.toLowerCase()}-${entry.channelType}`,
    country: entry.countryCode,
    currency: entry.currency,
    countryCurrency: entry.currency,
    status: "active",
    widgetStatus: "active",
    apiStatus: "active",
    feeLocal: entry.feeLocal,
    feeUSD: entry.feeUsd,
    min: entry.min,
    max: entry.max,
    widgetMin: entry.widgetMin,
    widgetMax: entry.widgetMax,
    channelType: entry.channelType,
    rampType: "withdraw",
    settlementType: "instant",
    estimatedSettlementTime: entry.estimatedSettlementTime,
  }));
}

function buildMockNetworks(country?: string): YellowCardNetwork[] {
  return listSimulatedYellowCardMarkets(country).map((entry) => ({
    id: `yc-network-${entry.countryCode.toLowerCase()}-${entry.networkCode.toLowerCase()}`,
    code: entry.networkCode,
    country: entry.countryCode,
    name: entry.networkName,
    status: "active",
    accountNumberType: entry.accountNumberType,
    countryAccountNumberType: entry.countryAccountNumberType,
    channelIds: [`yc-channel-${entry.countryCode.toLowerCase()}-${entry.channelType}`],
  }));
}

const mockCollections = new Map<string, MockCollectionRecord>();

export class YellowCardSimulatedProvider implements YellowCardProvider {
  private readonly config: ReturnType<typeof getYellowCardConfig>;

  constructor(mode: RuntimeMode = "test") {
    this.config = getYellowCardConfig(mode);
  }

  async getChannels(country?: string) {
    return buildMockChannels(country);
  }

  async getNetworks(country?: string) {
    return buildMockNetworks(country);
  }

  async getWidgetQuote(input: CreateWidgetQuoteInput) {
    const market = getSimulatedYellowCardMarketByCurrency(input.currency);

    if (!market) {
      throw new HttpError(
        404,
        `Sandbox quote coverage is not configured for currency ${input.currency}.`
      );
    }

    const quotedCryptoAmount = input.cryptoAmount ?? 0;
    const baseAmount =
      input.localAmount ??
      Number((quotedCryptoAmount * market.rateLocalPerUsd).toFixed(2));
    const serviceFeeLocal =
      input.localAmount !== undefined
        ? Number((baseAmount * 0.01).toFixed(2))
        : Number(market.feeLocal.toFixed(2));
    const partnerFeeLocal = Number((baseAmount * 0.0025).toFixed(2));
    const fiatReceived = Number((baseAmount - serviceFeeLocal - partnerFeeLocal).toFixed(2));
    const cryptoAmount =
      input.cryptoAmount ?? Number((baseAmount / market.rateLocalPerUsd).toFixed(4));

    return {
      currency: input.currency,
      coin: input.coin,
      cryptoAmount,
      network: input.network,
      channelId: input.channelId,
      transactionType: input.transactionType,
      fiatReceived,
      convertedAmount: baseAmount,
      rateLocal: Number((baseAmount / cryptoAmount).toFixed(2)),
      serviceFeeLocal,
      serviceFeeUSD: Number((serviceFeeLocal / market.rateLocalPerUsd).toFixed(2)),
      partnerFeeLocal,
      partnerFeeUSD: Number((partnerFeeLocal / market.rateLocalPerUsd).toFixed(2)),
      paymentMethod: "local-collection",
      settlement: "instant",
      updatedAt: new Date().toISOString(),
      expireAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      transactionLimitMin: market.widgetMin,
      transactionLimitMax: market.widgetMax,
    };
  }

  async resolveBankAccount(input: ResolveBankAccountInput) {
    const mockName = `Mock Account ${generateDigits(
      `${this.config.apiKey}:${input.networkId}:${input.accountNumber}`,
      4
    )}`;

    return {
      accountNumber: input.accountNumber,
      accountName: mockName,
      accountBank: `Mock Network ${input.networkId.slice(-4).toUpperCase()}`,
    };
  }

  async submitCollectionRequest(input: YellowCardCollectionRequestInput) {
    const now = Date.now();
    const state = inferMockSettlementStatus(input.source.accountNumber);
    const seed = `${this.config.apiKey}:${input.sequenceId}`;
    const market = getSimulatedYellowCardMarketByCurrency(input.currency ?? "NGN");
    const rateLocalPerUsd = market?.rateLocalPerUsd ?? 1555;
    const convertedAmount = Number(
      (input.localAmount ?? (input.amount ?? 0) * rateLocalPerUsd).toFixed(2)
    );
    const rate =
      input.amount && input.amount > 0
        ? Number((convertedAmount / input.amount).toFixed(4))
        : rateLocalPerUsd;
    const bankInfo =
      input.source.accountType === "bank"
        ? {
            name: `Mock ${input.country ?? "NG"} Collection Bank`,
            accountNumber: generateDigits(`${seed}:bank-account`, 10),
            accountName:
              input.recipient.businessName ??
              input.recipient.name ??
              "Renew Test Merchant",
          }
        : null;

    const record: MockCollectionRecord = {
      id: `yc-collection-${input.sequenceId}`,
      sequenceId: input.sequenceId,
      status: state,
      reference: buildMockReference(seed),
      depositId: buildMockDepositId(seed),
      customerUID: input.customerUID,
      channelId: input.channelId,
      currency: input.currency ?? "NGN",
      country: input.country ?? "NG",
      rate,
      convertedAmount,
      bankInfo,
      localAmount: input.localAmount ?? null,
      amount: input.amount ?? null,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    };

    mockCollections.set(record.id, record);
    mockCollections.set(record.sequenceId, record);

    return record;
  }

  async getCollectionById(collectionId: string) {
    const record = mockCollections.get(collectionId);

    if (!record) {
      throw new Error(`Mock collection ${collectionId} was not found.`);
    }

    return record;
  }

  async acceptCollectionRequest(collectionId: string) {
    const record = mockCollections.get(collectionId);

    if (!record) {
      throw new Error(`Mock collection ${collectionId} was not found.`);
    }

    if (record.status === "denied" || record.status === "failed") {
      return record;
    }

    const now = new Date().toISOString();
    const nextStatus = record.status === "complete" ? "complete" : "processing";
    const updatedRecord: MockCollectionRecord = {
      ...record,
      status: nextStatus,
      updatedAt: now,
    };

    mockCollections.set(record.id, updatedRecord);
    mockCollections.set(record.sequenceId, updatedRecord);

    return updatedRecord;
  }

  async denyCollectionRequest(collectionId: string) {
    const record = mockCollections.get(collectionId);

    if (!record) {
      throw new Error(`Mock collection ${collectionId} was not found.`);
    }

    const now = new Date().toISOString();
    const updatedRecord: MockCollectionRecord = {
      ...record,
      status: "denied",
      updatedAt: now,
    };

    mockCollections.set(record.id, updatedRecord);
    mockCollections.set(record.sequenceId, updatedRecord);

    return updatedRecord;
  }
}
