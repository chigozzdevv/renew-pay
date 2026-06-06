import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  listStellarSettlementAssets,
} from "@/features/settlement/providers/stellar/assets";
import {
  assertStellarVaultAccountConfig,
} from "@/features/settlement/providers/stellar/vault.service";
import {
  assertStellarUsdcTrustline,
} from "@/features/settlement/providers/stellar/trustline.service";
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
    provider: "stellar_vault" as const,
    chain: "stellar" as const,
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
    network: "stellar" as const,
    symbol: input.asset.symbol,
    label: input.asset.label,
    decimals: input.asset.decimals,
  };
}

export function listSettlementAssets(environment: RuntimeMode = "test") {
  return {
    environment,
    assets: listStellarSettlementAssets(environment).map((asset) =>
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
  assertStellarVaultAccountConfig(normalized);
  await assertStellarUsdcTrustline({
    environment: normalized.environment,
    address: normalized.destinationAddress ?? "",
  });

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

  const asset = assertStellarVaultAccountConfig(account);
  if (account.destinationAddress) {
    await assertStellarUsdcTrustline({
      environment: accountEnvironment,
      address: account.destinationAddress,
    });
  }
  account.mode = "standard";
  account.provider = "stellar_vault";
  account.chain = "stellar";
  account.assetSymbol = asset.symbol;

  if (normalized.metadata !== undefined) {
    account.metadata = normalized.metadata;
  }

  await account.save();

  return toSettlementAccountResponse(account);
}
