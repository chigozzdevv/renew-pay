import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  listAvalancheSettlementAssets,
} from "@/features/settlement/providers/avalanche/assets";
import {
  assertVaultAccountConfig,
  settlementVaultProvider,
} from "@/features/settlement/providers/avalanche/vault.service";
import {
  SettlementAccountModel,
  type SettlementAccountRecord,
} from "@/features/settlement/settlement-account.model";
import {
  type CreateSettlementAccountInput,
  type ListSettlementAccountsQuery,
  type UpdateSettlementAccountInput,
} from "@/features/settlement/settlement.validation";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { normalizeEvmAddress } from "@/shared/constants/address";
import { HttpError } from "@/shared/errors/http-error";
import {
  buildPagination,
  resolvePagination,
  type ListResult,
} from "@/shared/utils/pagination";
import {
  createRuntimeModeCondition,
} from "@/shared/utils/runtime-environment";

function normalizeAccountCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function deriveAccountCode(
  input: Pick<CreateSettlementAccountInput, "name" | "accountCode">
) {
  return normalizeAccountCode(input.accountCode ?? input.name) || "settlement-account";
}

function normalizeAccountInput<T extends CreateSettlementAccountInput | UpdateSettlementAccountInput>(
  input: T
) {
  return {
    ...input,
    mode: "standard" as const,
    provider: settlementVaultProvider,
    chain: "avalanche" as const,
    assetSymbol: "USDC",
  };
}

function toSettlementAccountResponse(document: SettlementAccountRecord) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    environment: document.environment,
    accountCode: document.accountCode,
    name: document.name,
    assetSymbol: document.assetSymbol,
    destinationAddress: document.destinationAddress ?? null,
    isDefault: document.isDefault,
    status: document.status,
    metadata: document.metadata ?? {},
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toSettlementAssetOption(input: {
  asset: {
    symbol: string;
    label: string;
    decimals: number;
  };
}) {
  return {
    network: "avalanche" as const,
    symbol: input.asset.symbol,
    label: input.asset.label,
    decimals: input.asset.decimals,
  };
}

export function listSettlementAssets(environment: RuntimeMode = "test") {
  return {
    environment,
    assets: listAvalancheSettlementAssets(environment).map((asset) =>
      toSettlementAssetOption({
        asset,
      })
    ),
  };
}

async function ensureMerchant(merchantId: string) {
  const merchant = await MerchantModel.exists({ _id: merchantId });

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }
}

async function applyDefaultAccountPolicy(input: {
  merchantId: string;
  environment: RuntimeMode;
  accountId?: string;
}) {
  await SettlementAccountModel.updateMany(
    {
      merchantId: input.merchantId,
      ...createRuntimeModeCondition("environment", input.environment),
      ...(input.accountId ? { _id: { $ne: input.accountId } } : {}),
    },
    { $set: { isDefault: false } }
  ).exec();
}

async function ensureAccountScope(
  accountId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const mongoQuery: Record<string, unknown> = {
    _id: accountId,
  };

  if (merchantId) {
    mongoQuery.merchantId = merchantId;
  }

  if (environment) {
    Object.assign(mongoQuery, createRuntimeModeCondition("environment", environment));
  }

  const account = await SettlementAccountModel.findOne(mongoQuery).exec();

  if (!account) {
    throw new HttpError(404, "Settlement account was not found.");
  }

  return account;
}

export async function createSettlementAccount(input: CreateSettlementAccountInput) {
  const normalized = normalizeAccountInput(input);
  await ensureMerchant(normalized.merchantId);
  assertVaultAccountConfig(normalized);

  if (normalized.isDefault) {
    await applyDefaultAccountPolicy({
      merchantId: normalized.merchantId,
      environment: normalized.environment,
    });
  }

  const account = await SettlementAccountModel.create({
    merchantId: normalized.merchantId,
    environment: normalized.environment,
    accountCode: deriveAccountCode(normalized),
    name: normalized.name,
    mode: normalized.mode,
    provider: normalized.provider,
    chain: normalized.chain,
    assetSymbol: normalized.assetSymbol,
    destinationAddress: normalized.destinationAddress ?? null,
    isDefault: normalized.isDefault,
    status: normalized.status,
    metadata: normalized.metadata ?? {},
  });

  return toSettlementAccountResponse(account);
}

export async function upsertDefaultSettlementAccountForWallet(input: {
  merchantId: string;
  environment: RuntimeMode;
  destinationAddress: string;
}) {
  const destinationAddress = normalizeEvmAddress(input.destinationAddress);

  if (!destinationAddress) {
    throw new HttpError(400, "Settlement wallet is invalid.");
  }

  const normalized = normalizeAccountInput({
    merchantId: input.merchantId,
    environment: input.environment,
    accountCode: "default",
    name: "Default settlement",
    destinationAddress,
    isDefault: true,
    status: "active",
    metadata: {
      source: "settlement_wallet",
    },
  });

  assertVaultAccountConfig(normalized);

  await applyDefaultAccountPolicy({
    merchantId: normalized.merchantId,
    environment: normalized.environment,
  });

  const account = await SettlementAccountModel.findOneAndUpdate(
    {
      merchantId: normalized.merchantId,
      accountCode: normalized.accountCode,
      ...createRuntimeModeCondition("environment", normalized.environment),
    },
    {
      $set: {
        environment: normalized.environment,
        name: normalized.name,
        mode: normalized.mode,
        provider: normalized.provider,
        chain: normalized.chain,
        assetSymbol: normalized.assetSymbol,
        destinationAddress,
        isDefault: true,
        status: normalized.status,
        metadata: normalized.metadata ?? {},
      },
      $setOnInsert: {
        merchantId: normalized.merchantId,
        accountCode: normalized.accountCode,
      },
    },
    {
      new: true,
      setDefaultsOnInsert: true,
      upsert: true,
    }
  ).exec();

  if (!account) {
    throw new HttpError(500, "Settlement account could not be configured.");
  }

  return toSettlementAccountResponse(account);
}

export async function listSettlementAccounts(query: ListSettlementAccountsQuery) {
  const filters: Record<string, unknown>[] = [];

  if (query.merchantId) {
    filters.push({ merchantId: query.merchantId });
  }

  if (query.environment) {
    filters.push(createRuntimeModeCondition("environment", query.environment));
  }

  if (query.status) {
    filters.push({ status: query.status });
  }

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "i");
    filters.push({
      $or: [
        { accountCode: pattern },
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
    const accounts = await SettlementAccountModel.find(mongoQuery)
      .sort({ isDefault: -1, createdAt: -1 })
      .exec();

    return {
      items: accounts.map(toSettlementAccountResponse),
    } satisfies ListResult<ReturnType<typeof toSettlementAccountResponse>>;
  }

  const [total, accounts] = await Promise.all([
    SettlementAccountModel.countDocuments(mongoQuery).exec(),
    SettlementAccountModel.find(mongoQuery)
      .sort({ isDefault: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: accounts.map(toSettlementAccountResponse),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toSettlementAccountResponse>>;
}

export async function getSettlementAccountById(
  accountId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const account = await ensureAccountScope(accountId, merchantId, environment);

  return toSettlementAccountResponse(account);
}

export async function getDefaultSettlementAccount(input: {
  merchantId: string;
  environment?: RuntimeMode;
}) {
  const account = await SettlementAccountModel.findOne({
    merchantId: input.merchantId,
    ...(input.environment
      ? createRuntimeModeCondition("environment", input.environment)
      : {}),
    isDefault: true,
    status: "active",
  }).exec();

  if (!account) {
    throw new HttpError(404, "Default settlement account was not found.");
  }

  return toSettlementAccountResponse(account);
}

export async function updateSettlementAccount(
  accountId: string,
  input: UpdateSettlementAccountInput,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const account = await ensureAccountScope(accountId, merchantId, environment);
  const normalized = normalizeAccountInput(input);
  const accountEnvironment = account.environment === "live" ? "live" : "test";

  if (normalized.isDefault) {
    await applyDefaultAccountPolicy({
      merchantId: account.merchantId.toString(),
      environment: accountEnvironment,
      accountId: account._id.toString(),
    });
  }

  if (normalized.accountCode !== undefined) {
    account.accountCode = normalizeAccountCode(normalized.accountCode);
  }

  if (normalized.name !== undefined) {
    account.name = normalized.name;
  }

  if (normalized.assetSymbol !== undefined) {
    account.assetSymbol = normalized.assetSymbol;
  }

  if (normalized.destinationAddress !== undefined) {
    account.destinationAddress = normalized.destinationAddress ?? null;
  }

  if (normalized.isDefault !== undefined) {
    account.isDefault = normalized.isDefault;
  }

  if (normalized.status !== undefined) {
    account.status = normalized.status;
  }

  const asset = assertVaultAccountConfig(account);
  account.mode = "standard";
  account.provider = settlementVaultProvider;
  account.chain = "avalanche";
  account.assetSymbol = asset.symbol;

  if (normalized.metadata !== undefined) {
    account.metadata = normalized.metadata;
  }

  await account.save();

  return toSettlementAccountResponse(account);
}
