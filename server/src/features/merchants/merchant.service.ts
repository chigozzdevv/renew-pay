import { HttpError } from "@/shared/errors/http-error";

import { env } from "@/config/env.config";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { assertSupportedBillingMarkets } from "@/features/payment-rails/payment-rails.service";
import type {
  CreateMerchantInput,
  ListMerchantsQuery,
  UpdateMerchantInput,
} from "@/features/merchants/merchant.validation";
import { normalizeSolanaAddress } from "@/shared/constants/solana";

function toMerchantResponse(document: {
  _id: { toString(): string };
  merchantAccount: string;
  payoutWallet?: string | null;
  reserveWallet?: string | null;
  name?: string | null;
  supportEmail?: string | null;
  billingTimezone: string;
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
    reserveWallet: document.reserveWallet ?? null,
    name: document.name ?? "",
    supportEmail: document.supportEmail ?? "",
    billingTimezone: document.billingTimezone,
    supportedMarkets: document.supportedMarkets,
    metadataHash: document.metadataHash,
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function createMerchant(input: CreateMerchantInput) {
  await assertSupportedBillingMarkets({
    markets: input.supportedMarkets,
    environment: env.PAYMENT_ENV,
  });

  const merchantAccount = normalizeSolanaAddress(input.merchantAccount);

  if (!merchantAccount) {
    throw new HttpError(400, "Merchant wallet is invalid.");
  }

  const existingMerchant = await MerchantModel.findOne({ merchantAccount }).exec();

  if (existingMerchant) {
    throw new HttpError(409, "A merchant already exists for this account.");
  }

  const createdMerchant = await MerchantModel.create({
    merchantAccount,
    payoutWallet: normalizeSolanaAddress(input.payoutWallet),
    reserveWallet: normalizeSolanaAddress(input.reserveWallet),
    name: input.name,
    supportEmail: input.supportEmail,
    billingTimezone: input.billingTimezone,
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
    await assertSupportedBillingMarkets({
      markets: input.supportedMarkets,
      environment: env.PAYMENT_ENV,
    });
  }

  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  if (input.payoutWallet !== undefined) {
    merchant.payoutWallet = normalizeSolanaAddress(input.payoutWallet);
  }

  if (input.reserveWallet !== undefined) {
    merchant.reserveWallet = normalizeSolanaAddress(input.reserveWallet);
  }

  if (input.name !== undefined) {
    merchant.name = input.name;
  }

  if (input.supportEmail !== undefined) {
    merchant.supportEmail = input.supportEmail;
  }

  if (input.billingTimezone !== undefined) {
    merchant.billingTimezone = input.billingTimezone;
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
