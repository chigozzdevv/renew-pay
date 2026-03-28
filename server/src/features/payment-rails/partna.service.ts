import { createVerify, constants as cryptoConstants } from "crypto";

import { HttpError } from "@/shared/errors/http-error";

import { env } from "@/config/env.config";
import { getPartnaConfig } from "@/config/partna.config";
import { PaymentRailEventModel } from "@/features/payment-rails/payment-rail-event.model";
import { getPartnaProvider } from "@/features/payment-rails/providers/partna/partna.factory";
import type {
  PartnaManagedBankAccount,
  PartnaManagedAccountInput,
} from "@/features/payment-rails/providers/partna/partna.types";
import { ChargeModel } from "@/features/charges/charge.model";
import { CustomerModel } from "@/features/customers/customer.model";
import { emitChargeWebhookEventForStatusChange } from "@/features/developers/developer-webhook-delivery.service";
import { queueChargeStatusNotifications } from "@/features/notifications/notification.service";
import { queueSettlementBridge } from "@/features/settlements/settlement.service";
import { SettlementModel } from "@/features/settlements/settlement.model";
import { getSolanaSettlementAuthorityKeypair } from "@/features/solana/solana-keypair.service";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { createRuntimeModeCondition } from "@/shared/utils/runtime-environment";

type PartnaWebhookPayload = {
  event?: string;
  signature?: string;
  data?: Record<string, unknown>;
};

function readString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function buildPartnaCallbackUrl(mode: RuntimeMode) {
  const url = new URL("/v1/payment-rails/webhooks/partna", env.API_BASE_URL);
  url.searchParams.set("environment", mode);
  return url.toString();
}

function extractNames(fullName: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      firstName: "Renew",
      lastName: "Customer",
      middleName: null as string | null,
    };
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "Customer",
      middleName: null as string | null,
    };
  }

  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
  };
}

export const PARTNA_CHECKOUT_VERIFICATION_FIELDS = [
  "phoneNumber",
  "dateOfBirth",
  "bvn",
  "stateOfOrigin",
  "stateOfResidence",
  "lgaOfOrigin",
  "lgaOfResidence",
  "addressLine1",
] as const;

export function buildPartnaVerificationSnapshot(currency: string) {
  return {
    provider: "partna" as const,
    status: "required",
    country: "NG",
    currency,
    instructions:
      "Complete identity verification once to unlock your permanent bank instructions.",
    requiredFields: [...PARTNA_CHECKOUT_VERIFICATION_FIELDS],
  };
}

export function hasActivePartnaPaymentProfile(customer: {
  paymentProfile?: {
    provider?: string | null;
    status?: string | null;
    bankTransfer?: {
      bankName?: string | null;
      accountName?: string | null;
      accountNumber?: string | null;
      currency?: string | null;
    } | null;
  } | null;
}) {
  return (
    customer.paymentProfile?.provider === "partna" &&
    customer.paymentProfile?.status === "active" &&
    Boolean(customer.paymentProfile?.bankTransfer?.accountNumber)
  );
}

export async function ensurePartnaCustomerPaymentProfile(input: {
  customerId: string;
  environment: RuntimeMode;
  verification: {
    phoneNumber: string;
    dateOfBirth: string;
    bvn: string;
    stateOfOrigin: string;
    stateOfResidence: string;
    lgaOfOrigin: string;
    lgaOfResidence: string;
    addressLine1: string;
    addressLine2?: string;
    addressLine3?: string;
    middleName?: string;
    country?: string;
  };
}) {
  const customer = await CustomerModel.findById(input.customerId).exec();

  if (!customer) {
    throw new HttpError(404, "Customer was not found.");
  }

  if (hasActivePartnaPaymentProfile(customer)) {
    return customer.paymentProfile;
  }

  const provider = getPartnaProvider(input.environment);
  const nameParts = extractNames(customer.name);
  const account = await provider.createManagedBankAccount({
    email: normalizeEmail(customer.email),
    fullName: customer.name,
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    middleName: input.verification.middleName ?? nameParts.middleName ?? undefined,
    dateOfBirth: input.verification.dateOfBirth,
    addressLine1: input.verification.addressLine1,
    addressLine2: input.verification.addressLine2,
    addressLine3: input.verification.addressLine3,
    phoneNumber: input.verification.phoneNumber,
    country: (input.verification.country ?? "NG").toUpperCase(),
    currency: customer.market,
    bvn: input.verification.bvn,
    stateOfOrigin: input.verification.stateOfOrigin,
    stateOfResidence: input.verification.stateOfResidence,
    lgaOfOrigin: input.verification.lgaOfOrigin,
    lgaOfResidence: input.verification.lgaOfResidence,
    callbackUrl: buildPartnaCallbackUrl(input.environment),
  } satisfies PartnaManagedAccountInput);

  customer.paymentProvider = "partna";
  customer.paymentProfile = {
    provider: "partna",
    status: "active",
    verifiedAt: new Date(),
    bankTransfer: {
      bankCode: account.bankCode,
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      currency: account.currency,
    },
    partna: {
      email: normalizeEmail(customer.email),
      fullName: customer.name,
      accountName: account.accountName,
      bvnLast4: input.verification.bvn.slice(-4),
      callbackUrl: buildPartnaCallbackUrl(input.environment),
      raw: account.raw,
    },
  };
  await customer.save();

  return customer.paymentProfile;
}

export async function createPartnaChargeInstruction(input: {
  environment: RuntimeMode;
  customerEmail: string;
  customerName: string;
  localAmount: number;
  paymentProfile: {
    bankTransfer?: {
      bankCode?: string | null;
      bankName?: string | null;
      accountName?: string | null;
      accountNumber?: string | null;
      currency?: string | null;
    } | null;
  };
}) {
  const config = getPartnaConfig(input.environment);

  if (!config.apiUser && input.environment === "live") {
    throw new HttpError(500, "Partna merchant user is not configured.");
  }

  const provider = getPartnaProvider(input.environment);
  const voucher = await provider.createVoucher({
    email: normalizeEmail(input.customerEmail),
    fullName: input.customerName,
    amount: Number(input.localAmount.toFixed(2)),
    merchant: config.apiUser || "renew-sandbox",
  });

  return {
    voucher,
    paymentSnapshot: {
      provider: "partna" as const,
      kind: "bank_transfer" as const,
      externalChargeId: voucher.voucherId,
      status: voucher.status,
      reference: voucher.reference ?? voucher.voucherId,
      expiresAt: null,
      redirectUrl: voucher.paymentUrl,
      bankTransfer: {
        bankCode: input.paymentProfile.bankTransfer?.bankCode ?? null,
        bankName: input.paymentProfile.bankTransfer?.bankName ?? null,
        accountName: input.paymentProfile.bankTransfer?.accountName ?? null,
        accountNumber: input.paymentProfile.bankTransfer?.accountNumber ?? null,
        currency: input.paymentProfile.bankTransfer?.currency ?? null,
      },
    },
  };
}

function readPartnaWebhookEventKey(payload: PartnaWebhookPayload, environment: RuntimeMode) {
  const event = readString(payload.event) ?? "unknown";
  const data = asRecord(payload.data) ?? {};
  const id = readString(data.id) ?? readString(data.reference) ?? "none";
  const status = readString(data.status) ?? "none";
  return `partna:${environment}:${event}:${id}:${status}`;
}

function normalizePartnaWebhookState(payload: PartnaWebhookPayload) {
  const event = readString(payload.event)?.toLowerCase() ?? "unknown";
  const status = readString(asRecord(payload.data)?.status)?.toLowerCase();
  return status ? `${event}:${status}` : event;
}

function extractPartnaVoucherCode(payload: PartnaWebhookPayload) {
  const data = asRecord(payload.data);
  return readString(data?.voucherCode) ?? readString(data?.vouchercode);
}

function extractPartnaVoucherId(payload: PartnaWebhookPayload) {
  const data = asRecord(payload.data);
  return readString(data?.id) ?? readString(data?.reference);
}

function eventIsVoucherSuccess(payload: PartnaWebhookPayload) {
  const event = readString(payload.event)?.toLowerCase() ?? "";
  const status = readString(asRecord(payload.data)?.status)?.toLowerCase() ?? "";

  return (
    event === "voucher.updated" &&
    (status === "success" || status === "paid" || status === "complete")
  );
}

export function verifyPartnaWebhookSignature(input: {
  data: Record<string, unknown>;
  signature: string;
  publicKey: string;
}) {
  const receivedSignature = input.signature.trim();

  if (!receivedSignature || !input.publicKey.trim()) {
    return false;
  }

  const verifier = createVerify("RSA-SHA512");
  verifier.update(JSON.stringify(input.data));
  verifier.end();

  try {
    return verifier.verify(
      {
        key: input.publicKey,
        padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
      },
      Buffer.from(receivedSignature, "base64")
    );
  } catch {
    return false;
  }
}

export async function processPartnaWebhook(
  payload: PartnaWebhookPayload,
  environmentHint?: RuntimeMode
) {
  const environment =
    environmentHint ??
    ((readString(asRecord(payload.data)?.environment) ?? "test") === "live" ? "live" : "test");
  const eventKey = readPartnaWebhookEventKey(payload, environment);
  const state = normalizePartnaWebhookState(payload);

  const existingEvent = await PaymentRailEventModel.findOne({
    provider: "partna",
    environment,
    eventKey,
  }).exec();

  if (existingEvent?.processedAt) {
    return {
      processed: true,
      idempotent: true,
      matched: Boolean(existingEvent.result),
      state,
      externalChargeId: extractPartnaVoucherId(payload),
    };
  }

  let webhookEvent = existingEvent;

  if (!webhookEvent) {
    webhookEvent = await PaymentRailEventModel.create({
      provider: "partna",
      environment,
      eventKey,
      state,
      externalId: extractPartnaVoucherId(payload),
      sequenceId: extractPartnaVoucherId(payload),
      payload,
    });
  }

  const voucherId = extractPartnaVoucherId(payload);

  if (!voucherId) {
    webhookEvent.result = {
      processed: false,
      matched: false,
      reason: "missing_voucher_id",
      state,
    };
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();

    return webhookEvent.result as Record<string, unknown>;
  }

  const charge = await ChargeModel.findOne({
    externalChargeId: voucherId,
    paymentProvider: "partna",
    ...createRuntimeModeCondition("environment", environment),
  }).exec();

  if (!charge) {
    webhookEvent.result = {
      processed: false,
      matched: false,
      state,
      externalChargeId: voucherId,
    };
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();

    return webhookEvent.result as Record<string, unknown>;
  }

  const linkedSettlement = await SettlementModel.findOne({
    sourceChargeId: charge._id,
    ...createRuntimeModeCondition("environment", environment),
  })
    .sort({ createdAt: -1 })
    .exec();

  const previousChargeStatus = charge.status;
  const voucherCode =
    extractPartnaVoucherCode(payload) ??
    readString(asRecord(charge.providerMetadata)?.voucherCode);

  if (eventIsVoucherSuccess(payload)) {
    if (!voucherCode) {
      throw new HttpError(
        409,
        "Partna voucher code is required before onramp can be executed."
      );
    }

    const provider = getPartnaProvider(environment);
    const settlementAuthority = getSolanaSettlementAuthorityKeypair(environment);
    const redeemResult = await provider.redeemVoucherAndWithdraw({
      email:
        readString(asRecord(payload.data)?.email) ??
        readString(asRecord(charge.providerMetadata)?.email) ??
        "",
      voucherCode,
      currency: "USDC",
      network: "solana",
      cryptoAddress: settlementAuthority.publicKey.toBase58(),
    });

    charge.status = linkedSettlement ? "awaiting_settlement" : "settled";
    charge.failureCode = null;
    charge.processedAt = new Date();
    charge.providerMetadata = {
      ...(asRecord(charge.providerMetadata) ?? {}),
      voucherCode,
      voucherId,
      redeemResult,
      email:
        readString(asRecord(payload.data)?.email) ??
        readString(asRecord(charge.providerMetadata)?.email) ??
        null,
    };
    await charge.save();

    if (linkedSettlement) {
      await queueSettlementBridge(linkedSettlement._id.toString(), {
        merchantId: linkedSettlement.merchantId.toString(),
        environment,
      });
    }
  } else if (state.includes("failed") || state.includes("cancel")) {
    charge.status = "failed";
    charge.failureCode = state;
    charge.processedAt = new Date();
    charge.providerMetadata = {
      ...(asRecord(charge.providerMetadata) ?? {}),
      voucherId,
      voucherCode,
    };
    await charge.save();

    if (linkedSettlement && linkedSettlement.status !== "settled") {
      linkedSettlement.status = "failed";
      await linkedSettlement.save();
    }
  } else {
    charge.status = charge.status === "settled" ? charge.status : "pending";
    charge.processedAt = new Date();
    charge.providerMetadata = {
      ...(asRecord(charge.providerMetadata) ?? {}),
      voucherId,
      voucherCode,
    };
    await charge.save();
  }

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
    matched: true,
    state,
    externalChargeId: charge.externalChargeId,
    chargeId: charge._id.toString(),
    chargeStatus: charge.status,
    settlementId: linkedSettlement?._id.toString() ?? null,
  };

  webhookEvent.result = result;
  webhookEvent.processedAt = new Date();
  await webhookEvent.save();

  return result;
}

export async function getCustomerPartnaBankAccount(
  customerId: string
): Promise<PartnaManagedBankAccount | null> {
  const customer = await CustomerModel.findById(customerId)
    .select({ paymentProfile: 1 })
    .lean()
    .exec();

  if (!customer?.paymentProfile?.bankTransfer?.accountNumber) {
    return null;
  }

  return {
    provider: "partna",
    accountName: customer.paymentProfile.bankTransfer.accountName ?? "Renew account",
    bankCode: customer.paymentProfile.bankTransfer.bankCode ?? null,
    bankName: customer.paymentProfile.bankTransfer.bankName ?? null,
    accountNumber: customer.paymentProfile.bankTransfer.accountNumber ?? null,
    currency: customer.paymentProfile.bankTransfer.currency ?? "NGN",
    email: readString(customer.paymentProfile.partna?.email) ?? "",
    fullName: readString(customer.paymentProfile.partna?.fullName) ?? "",
    raw: asRecord(customer.paymentProfile.partna?.raw) ?? {},
  };
}
