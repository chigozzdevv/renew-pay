import { HttpError } from "@/shared/errors/http-error";

import { env } from "@/config/env.config";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { assertSupportedCollectionMarkets } from "@/features/onramps/onramp.service";
import type {
  CreateMerchantInput,
  ListMerchantsQuery,
  UpdateMerchantInput,
} from "@/features/merchants/merchant.validation";
import { normalizeEvmAddress } from "@/shared/constants/address";

function toMerchantResponse(document: {
  _id: { toString(): string };
  merchantAccount: string;
  payoutWallet?: string | null;
  name?: string | null;
  supportEmail?: string | null;
  timezone: string;
  supportedMarkets: string[];
  metadataHash: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantAccount: document.merchantAccount,
    payoutWallet: document.payoutWallet ?? "",
    name: document.name ?? "",
    supportEmail: document.supportEmail ?? "",
    timezone: document.timezone ?? "UTC",
    supportedMarkets: document.supportedMarkets,
    metadataHash: document.metadataHash,
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function createMerchant(input: CreateMerchantInput) {
  await assertSupportedCollectionMarkets({
    markets: input.supportedMarkets,
    environment: env.PAYMENT_ENV,
  });

  const merchantAccount = normalizeEvmAddress(input.merchantAccount);

  if (!merchantAccount) {
    throw new HttpError(400, "Merchant wallet is invalid.");
  }

  const existingMerchant = await MerchantModel.findOne({ merchantAccount }).exec();

  if (existingMerchant) {
    throw new HttpError(409, "A merchant already exists for this account.");
  }

  const createdMerchant = await MerchantModel.create({
    merchantAccount,
    payoutWallet: normalizeEvmAddress(input.payoutWallet),
    name: input.name,
    supportEmail: input.supportEmail,
    timezone: input.timezone,
    supportedMarkets: input.supportedMarkets,
    metadataHash: input.metadataHash,
    status: input.status,
  });

  return toMerchantResponse(createdMerchant);
}

export async function listMerchants(query: ListMerchantsQuery) {
  const mongoQuery: Record<string, unknown> = {};

  if (query.status) {
    mongoQuery.status = query.status;
  }

  if (query.search) {
    const pattern = new RegExp(query.search, "i");
    mongoQuery.$or = [
      { name: pattern },
      { supportEmail: pattern },
      { merchantAccount: pattern },
    ];
  }

  const merchants = await MerchantModel.find(mongoQuery)
    .sort({ createdAt: -1 })
    .exec();

  return merchants.map(toMerchantResponse);
}

export async function getMerchantById(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return toMerchantResponse(merchant);
}

export async function updateMerchant(
  merchantId: string,
  input: UpdateMerchantInput
) {
  if (input.supportedMarkets !== undefined) {
    await assertSupportedCollectionMarkets({
      markets: input.supportedMarkets,
      environment: env.PAYMENT_ENV,
    });
  }

  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  if (input.payoutWallet !== undefined) {
    merchant.payoutWallet = normalizeEvmAddress(input.payoutWallet);
  }

  if (input.name !== undefined) {
    merchant.name = input.name;
  }

  if (input.supportEmail !== undefined) {
    merchant.supportEmail = input.supportEmail;
  }

  if (input.timezone !== undefined) {
    merchant.timezone = input.timezone;
  }

  if (input.supportedMarkets !== undefined) {
    merchant.supportedMarkets = input.supportedMarkets;
  }

  if (input.metadataHash !== undefined) {
    merchant.metadataHash = input.metadataHash;
  }

  if (input.status !== undefined) {
    merchant.status = input.status;
  }

  await merchant.save();

  return toMerchantResponse(merchant);
}
