import { createVerify, constants as cryptoConstants } from "crypto";

import { HttpError } from "@/shared/errors/http-error";

import { env } from "@/config/env.config";
import { getPartnaConfig } from "@/config/partna.config";
import { PaymentRailEventModel } from "@/features/payment-rails/payment-rail-event.model";
import { getPartnaProvider } from "@/features/payment-rails/providers/partna/partna.factory";
import type {
  PartnaBvnVerificationMethod,
  PartnaManagedBankAccount,
  PartnaVoucherRecord,
} from "@/features/payment-rails/providers/partna/partna.types";
import { ChargeModel } from "@/features/charges/charge.model";
import { CustomerModel } from "@/features/customers/customer.model";
import { InvoiceModel } from "@/features/invoices/invoice.model";
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

function readNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

function readPartnaFeeBearer(value: unknown) {
  const normalized = readString(value)?.toLowerCase() ?? null;
  return normalized === "merchant" || normalized === "client" ? normalized : null;
}

function toRoundedFee(value: number) {
  return Number(Math.max(0, value).toFixed(6));
}

export function derivePartnaFeeAmountUsdc(input: {
  fxRate: number;
  voucher?: PartnaVoucherRecord | null;
  payloadData?: Record<string, unknown> | null;
  redeemResult?: Record<string, unknown> | null;
}) {
  const redeemResult = input.redeemResult ?? null;
  const payloadData = input.payloadData ?? null;
  const feeBearer =
    readPartnaFeeBearer(redeemResult?.feeBearer) ??
    readPartnaFeeBearer(payloadData?.feeBearer) ??
    readPartnaFeeBearer(input.voucher?.feeBearer) ??
    null;

  if (feeBearer === "client") {
    return 0;
  }

  const convertedVoucherFeeCurrency =
    readString(redeemResult?.convertedVoucherFeeCurrency)?.toUpperCase() ??
    readString(redeemResult?.creditCurrency)?.toUpperCase() ??
    readString(redeemResult?.toCurrency)?.toUpperCase() ??
    null;
  const convertedVoucherFee =
    readNumber(redeemResult?.convertedVoucherFee) ??
    readNumber(redeemResult?.merchantFee) ??
    null;

  if (convertedVoucherFeeCurrency === "USDC" && convertedVoucherFee !== null) {
    return toRoundedFee(convertedVoucherFee);
  }

  const localFee =
    readNumber(redeemResult?.voucherFee) ??
    readNumber(payloadData?.fee) ??
    input.voucher?.fee ??
    null;
  const wavedFee =
    readNumber(payloadData?.wavedFee) ??
    input.voucher?.wavedFee ??
    0;
  const effectiveLocalFee =
    localFee === null ? null : Math.max(0, localFee - Math.max(0, wavedFee ?? 0));

  if (effectiveLocalFee !== null && Number.isFinite(input.fxRate) && input.fxRate > 0) {
    return toRoundedFee(effectiveLocalFee / input.fxRate);
  }

  return null;
}

export const PARTNA_CHECKOUT_VERIFICATION_FIELDS = [
  "bvn",
] as const;

export const PARTNA_CHECKOUT_PHONE_FIELDS = ["phone"] as const;

export const PARTNA_CHECKOUT_OTP_FIELDS = ["otp"] as const;

function pickPreferredPartnaVerificationMethod(methods: PartnaBvnVerificationMethod[]) {
  const preferredOrder = ["email", "phone", "phone_1", "alternate_phone"];

  for (const method of preferredOrder) {
    const matched = methods.find((entry) => entry.method === method);

    if (matched) {
      return matched;
    }
  }

  return methods[0] ?? null;
}

function sanitizePartnaAccountName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

function buildPartnaCustomerAccountName(customer: {
  customerRef: string;
  _id: { toString(): string };
}) {
  const ref = sanitizePartnaAccountName(customer.customerRef);
  const suffix = customer._id.toString().slice(-6).toLowerCase();
  const accountName = sanitizePartnaAccountName(`${ref || "renew"}${suffix}`);
  return accountName || `renew${suffix}`;
}

function readPartnaResponseMessage(payload: Record<string, unknown> | null) {
  return readString(payload?.message);
}

function responseRequiresPartnaPhoneConfirmation(payload: Record<string, unknown> | null) {
  const message = readPartnaResponseMessage(payload)?.toLowerCase() ?? "";
  return message.includes("confirm phone");
}

function isPartnaAccountAlreadyExistsError(error: unknown) {
  return (
    error instanceof HttpError &&
    error.message.trim().toLowerCase() === "account already exists"
  );
}

export function buildPartnaVerificationSnapshot(currency: string) {
  return {
    provider: "partna" as const,
    status: "required",
    country: "NG",
    currency,
    instructions: "Enter your BVN to verify and unlock payment details.",
    requiredFields: [...PARTNA_CHECKOUT_VERIFICATION_FIELDS],
  };
}

export function buildPartnaOtpVerificationSnapshot(input: {
  currency: string;
  accountName: string;
  verificationMethod: string;
  verificationHint?: string | null;
}) {
  return {
    provider: "partna" as const,
    status: "otp_required",
    country: "NG",
    currency: input.currency,
    instructions:
      input.verificationHint?.trim() ||
      "Enter the verification code Partna sent to you.",
    requiredFields: [...PARTNA_CHECKOUT_OTP_FIELDS],
    accountName: input.accountName,
    verificationMethod: input.verificationMethod,
  };
}

export function buildPartnaPhoneVerificationSnapshot(input: {
  currency: string;
  accountName: string;
  verificationMethod: string;
  instructions?: string | null;
}) {
  return {
    provider: "partna" as const,
    status: "phone_required",
    country: "NG",
    currency: input.currency,
    instructions:
      input.instructions?.trim() || "Enter the phone number linked to your BVN to continue.",
    requiredFields: [...PARTNA_CHECKOUT_PHONE_FIELDS],
    accountName: input.accountName,
    verificationMethod: input.verificationMethod,
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
} | null, currency?: string | null) {
  return (
    Boolean(customer) &&
    customer?.paymentProfile?.provider === "partna" &&
    customer?.paymentProfile?.status === "active" &&
    Boolean(customer?.paymentProfile?.bankTransfer?.accountNumber) &&
    (!currency ||
      !customer?.paymentProfile?.bankTransfer?.currency ||
      customer.paymentProfile.bankTransfer.currency === currency)
  );
}

export async function startPartnaCustomerPaymentProfileVerification(input: {
  customerId: string;
  environment: RuntimeMode;
  verification: {
    bvn: string;
  };
}) {
  const customer = await CustomerModel.findById(input.customerId).exec();

  if (!customer) {
    throw new HttpError(404, "Customer was not found.");
  }

  if (hasActivePartnaPaymentProfile(customer, customer.market)) {
    return {
      accountName: customer.paymentProfile?.partna?.accountName ?? null,
      verificationMethod: null,
      verificationHint: null,
    };
  }

  const provider = getPartnaProvider(input.environment);
  const accountName =
    sanitizePartnaAccountName(customer.paymentProfile?.partna?.accountName ?? "") ||
    buildPartnaCustomerAccountName(customer);

  try {
    await provider.createAccount({
      accountName,
    });
  } catch (error) {
    if (!isPartnaAccountAlreadyExistsError(error)) {
      throw error;
    }
  }

  const methods = await provider.initiateBvnKyc({
    accountName,
    bvn: input.verification.bvn,
  });
  const selectedMethod = pickPreferredPartnaVerificationMethod(methods);

  if (!selectedMethod) {
    throw new HttpError(
      502,
      "Partna did not return a verification method for this account."
    );
  }

  const otpDispatchResult = await provider.handleBvnOtpMethod({
    accountName,
    verificationMethod: selectedMethod.method,
  });
  const phoneConfirmationRequired = responseRequiresPartnaPhoneConfirmation(otpDispatchResult);

  const existingRaw =
    customer.paymentProfile?.partna?.raw &&
    typeof customer.paymentProfile.partna.raw === "object" &&
    customer.paymentProfile.partna.raw !== null
      ? (customer.paymentProfile.partna.raw as Record<string, unknown>)
      : {};
  customer.paymentProvider = "partna";
  customer.paymentProfile = {
    provider: "partna",
    status: "pending",
    verifiedAt: null,
    bankTransfer: null,
    partna: {
      email: normalizeEmail(customer.email),
      fullName: customer.name,
      accountName,
      bvnLast4: input.verification.bvn.slice(-4),
      callbackUrl: buildPartnaCallbackUrl(input.environment),
      raw: {
        ...existingRaw,
        kycStatus: phoneConfirmationRequired ? "phone_confirmation_required" : "otp_pending",
        verificationMethods: methods,
        selectedVerificationMethod: selectedMethod.method,
        selectedVerificationHint: selectedMethod.hint,
        otpDispatchMessage: readPartnaResponseMessage(otpDispatchResult),
      },
    },
  };
  await customer.save();

  return {
    accountName,
    verificationMethod: selectedMethod.method,
    verificationHint: selectedMethod.hint,
    phoneConfirmationRequired,
    phoneConfirmationMessage: readPartnaResponseMessage(otpDispatchResult),
  };
}

export async function continuePartnaCustomerPaymentProfileVerificationAfterPhone(input: {
  customerId: string;
  environment: RuntimeMode;
  verification: {
    phone: string;
  };
  accountName?: string | null;
  verificationMethod?: string | null;
}) {
  const customer = await CustomerModel.findById(input.customerId).exec();

  if (!customer) {
    throw new HttpError(404, "Customer was not found.");
  }

  if (hasActivePartnaPaymentProfile(customer, customer.market)) {
    return {
      verificationMethod:
        readString(
          (customer.paymentProfile?.partna?.raw as Record<string, unknown> | null)
            ?.selectedVerificationMethod
        ) ?? input.verificationMethod ?? null,
      verificationHint:
        readString(
          (customer.paymentProfile?.partna?.raw as Record<string, unknown> | null)
            ?.selectedVerificationHint
        ) ?? null,
    };
  }

  const provider = getPartnaProvider(input.environment);
  const accountName =
    sanitizePartnaAccountName(input.accountName ?? "") ||
    sanitizePartnaAccountName(customer.paymentProfile?.partna?.accountName ?? "") ||
    buildPartnaCustomerAccountName(customer);
  const existingRaw =
    customer.paymentProfile?.partna?.raw &&
    typeof customer.paymentProfile.partna.raw === "object" &&
    customer.paymentProfile.partna.raw !== null
      ? (customer.paymentProfile.partna.raw as Record<string, unknown>)
      : {};
  const selectedVerificationMethod =
    input.verificationMethod?.trim() ||
    readString(existingRaw.selectedVerificationMethod) ||
    "email";

  await provider.confirmPhone({
    accountName,
    phone: input.verification.phone,
  });

  const otpDispatchResult = await provider.handleBvnOtpMethod({
    accountName,
    verificationMethod: selectedVerificationMethod,
  });

  customer.paymentProvider = "partna";
  customer.paymentProfile = {
    provider: "partna",
    status: "pending",
    verifiedAt: null,
    bankTransfer: null,
    partna: {
      email: normalizeEmail(customer.email),
      fullName: customer.name,
      accountName,
      bvnLast4: customer.paymentProfile?.partna?.bvnLast4 ?? null,
      callbackUrl: buildPartnaCallbackUrl(input.environment),
      raw: {
        ...existingRaw,
        kycStatus: "otp_pending",
        selectedVerificationMethod,
        phoneConfirmedAt: new Date().toISOString(),
        confirmedPhone: input.verification.phone.trim(),
        otpDispatchMessage: readPartnaResponseMessage(otpDispatchResult),
      },
    },
  };
  await customer.save();

  return {
    verificationMethod: selectedVerificationMethod,
    verificationHint: readString(existingRaw.selectedVerificationHint),
  };
}

export async function completePartnaCustomerPaymentProfileVerification(input: {
  customerId: string;
  environment: RuntimeMode;
  verification: {
    otp: string;
  };
  accountName?: string | null;
}) {
  const customer = await CustomerModel.findById(input.customerId).exec();

  if (!customer) {
    throw new HttpError(404, "Customer was not found.");
  }

  if (hasActivePartnaPaymentProfile(customer, customer.market)) {
    return customer.paymentProfile;
  }

  const provider = getPartnaProvider(input.environment);
  const accountName =
    sanitizePartnaAccountName(input.accountName ?? "") ||
    sanitizePartnaAccountName(customer.paymentProfile?.partna?.accountName ?? "") ||
    buildPartnaCustomerAccountName(customer);
  const existingRaw =
    customer.paymentProfile?.partna?.raw &&
    typeof customer.paymentProfile.partna.raw === "object" &&
    customer.paymentProfile.partna.raw !== null
      ? (customer.paymentProfile.partna.raw as Record<string, unknown>)
      : {};
  const verifiedBankAccount = await provider
    .confirmBvnOtp({
      accountName,
      currency: customer.market,
      otp: input.verification.otp,
    })
    .then(() =>
      provider.createBankAccount({
        accountName,
        currency: customer.market,
        preferredAccountName: customer.name,
      })
    );

  customer.paymentProvider = "partna";
  customer.paymentProfile = {
    provider: "partna",
    status: "active",
    verifiedAt: new Date(),
    bankTransfer: {
      bankCode: verifiedBankAccount.bankCode,
      bankName: verifiedBankAccount.bankName,
      accountName: verifiedBankAccount.accountName,
      accountNumber: verifiedBankAccount.accountNumber,
      currency: verifiedBankAccount.currency,
    },
    partna: {
      email: normalizeEmail(customer.email),
      fullName: customer.name,
      accountName,
      bvnLast4: customer.paymentProfile?.partna?.bvnLast4 ?? null,
      callbackUrl: buildPartnaCallbackUrl(input.environment),
      raw: {
        ...existingRaw,
        kycStatus: "verified",
        bankAccount: verifiedBankAccount.raw,
      },
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

async function applyPartnaFeeState(input: {
  charge: {
    fxRate: number;
    feeAmount: number;
    providerMetadata?: unknown;
  };
  linkedSettlement:
    | {
        status: string;
        feeUsdc: number;
        netUsdc: number;
        grossUsdc: number;
        save: () => Promise<unknown>;
      }
    | null;
  payloadData?: Record<string, unknown> | null;
  redeemResult?: Record<string, unknown> | null;
}) {
  const feeAmountUsdc = derivePartnaFeeAmountUsdc({
    fxRate: input.charge.fxRate,
    payloadData: input.payloadData ?? null,
    redeemResult: input.redeemResult ?? null,
  });
  const voucherFeeLocal =
    readNumber(input.redeemResult?.voucherFee) ??
    readNumber(input.payloadData?.fee) ??
    null;
  const voucherWavedFeeLocal = readNumber(input.payloadData?.wavedFee);
  const feeBearer =
    readPartnaFeeBearer(input.redeemResult?.feeBearer) ??
    readPartnaFeeBearer(input.payloadData?.feeBearer) ??
    null;
  const providerMetadata = asRecord(input.charge.providerMetadata) ?? {};

  input.charge.providerMetadata = {
    ...providerMetadata,
    ...(voucherFeeLocal !== null ? { voucherFeeLocal } : {}),
    ...(voucherWavedFeeLocal !== null ? { voucherWavedFeeLocal } : {}),
    ...(feeBearer ? { feeBearer } : {}),
    ...(input.redeemResult ? { redeemResult: input.redeemResult } : {}),
  };

  if (feeAmountUsdc !== null) {
    input.charge.feeAmount = feeAmountUsdc;
  }

  if (
    input.linkedSettlement &&
    input.linkedSettlement.status !== "settled" &&
    feeAmountUsdc !== null
  ) {
    input.linkedSettlement.feeUsdc = feeAmountUsdc;
    input.linkedSettlement.netUsdc = Number(
      Math.max(0.01, input.linkedSettlement.grossUsdc - feeAmountUsdc).toFixed(2)
    );
    await input.linkedSettlement.save();
  }

  return {
    feeAmountUsdc,
  };
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

  const verifier = createVerify("sha256");
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
  const payloadData = asRecord(payload.data) ?? null;

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
        readString(payloadData?.email) ??
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
      email:
        readString(payloadData?.email) ??
        readString(asRecord(charge.providerMetadata)?.email) ??
        null,
    };
    await applyPartnaFeeState({
      charge,
      linkedSettlement,
      payloadData,
      redeemResult: asRecord(redeemResult) ?? null,
    });
    await charge.save();

    if (
      previousChargeStatus !== "settled" &&
      previousChargeStatus !== "awaiting_settlement"
    ) {
      if (charge.sourceKind === "invoice" && charge.invoiceId) {
        const invoice = await InvoiceModel.findById(charge.invoiceId)
          .select({ customerId: 1 })
          .lean()
          .exec();

        if (invoice?.customerId) {
          await CustomerModel.findByIdAndUpdate(invoice.customerId, {
            $inc: { monthlyVolumeUsdc: charge.usdcAmount },
          }).exec();
        }
      }
    }

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
    await applyPartnaFeeState({
      charge,
      linkedSettlement,
      payloadData,
    });
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
    await applyPartnaFeeState({
      charge,
      linkedSettlement,
      payloadData,
    });
    await charge.save();
  }

  if (charge.invoiceId) {
    const invoice = await InvoiceModel.findById(charge.invoiceId).exec();

    if (invoice) {
      invoice.paymentSnapshot = invoice.paymentSnapshot
        ? {
            ...invoice.paymentSnapshot,
            feeAmount: charge.feeAmount,
            status: charge.status,
          }
        : { feeAmount: charge.feeAmount, status: charge.status };
      invoice.feeAmount = charge.feeAmount;

      if (charge.status === "pending") {
        invoice.status = "pending_payment";
      } else if (charge.status === "awaiting_settlement") {
        invoice.status = "processing";
      } else if (charge.status === "settled") {
        invoice.status = "paid";
        invoice.paidAt = invoice.paidAt ?? charge.processedAt ?? new Date();
      } else if (charge.status === "failed" || charge.status === "reversed") {
        invoice.status = invoice.dueDate.getTime() < Date.now() ? "overdue" : "issued";
      }

      await invoice.save();
    }
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
