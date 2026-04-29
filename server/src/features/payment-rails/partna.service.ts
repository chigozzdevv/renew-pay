import { createVerify, constants as cryptoConstants } from "crypto";

import { HttpError } from "@/shared/errors/http-error";

import { env } from "@/config/env.config";
import { PaymentRailEventModel } from "@/features/payment-rails/payment-rail-event.model";
import { getPartnaProvider } from "@/features/payment-rails/providers/partna/partna.factory";
import type {
  PartnaBvnVerificationMethod,
  PartnaManagedBankAccount,
  PartnaVoucherRecord,
} from "@/features/payment-rails/providers/partna/partna.types";
import { CustomerModel } from "@/features/customers/customer.model";
import { emitPaymentWebhookEventForStatusChange } from "@/features/developers/developer-webhook-delivery.service";
import { PaymentModel } from "@/features/payments/payment.model";
import { queuePayoutProcessing } from "@/features/payouts/payout.service";
import { PayoutModel } from "@/features/payouts/payout.model";
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

function isPartnaPhoneConfirmationRequiredError(error: unknown) {
  return (
    error instanceof HttpError &&
    error.message.trim().toLowerCase().includes("confirm phone")
  );
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
      verificationMethods: [] as PartnaBvnVerificationMethod[],
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
  if (methods.length === 0) {
    throw new HttpError(
      502,
      "Partna did not return a verification method for this account."
    );
  }

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
        kycStatus: "method_required",
        verificationMethods: methods,
        selectedVerificationMethod: null,
        selectedVerificationHint: null,
        otpDispatchMessage: null,
      },
    },
  };
  await customer.save();

  return {
    accountName,
    verificationMethods: methods,
  };
}

export async function continuePartnaCustomerPaymentProfileVerificationAfterMethod(input: {
  customerId: string;
  environment: RuntimeMode;
  verification: {
    verificationMethod: string;
  };
  accountName?: string | null;
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
        ) ?? input.verification.verificationMethod,
      verificationHint:
        readString(
          (customer.paymentProfile?.partna?.raw as Record<string, unknown> | null)
            ?.selectedVerificationHint
        ) ?? null,
      phoneConfirmationRequired: false,
      phoneConfirmationMessage: null,
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
  const storedMethods = Array.isArray(existingRaw.verificationMethods)
    ? existingRaw.verificationMethods
        .map((entry) =>
          typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : null
        )
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          method: readString(entry.method) ?? "",
          hint: readString(entry.hint),
        }))
        .filter((entry) => entry.method.length > 0)
    : [];
  const selectedMethod = input.verification.verificationMethod.trim();
  const selectedMethodRecord =
    storedMethods.find((entry) => entry.method === selectedMethod) ?? null;

  if (!selectedMethod) {
    throw new HttpError(409, "Verification method is required.");
  }

  let otpDispatchResult: Record<string, unknown> | null = null;
  let phoneConfirmationRequired = false;
  let phoneConfirmationMessage: string | null = null;

  try {
    otpDispatchResult = await provider.handleBvnOtpMethod({
      accountName,
      verificationMethod: selectedMethod,
    });
    phoneConfirmationRequired = responseRequiresPartnaPhoneConfirmation(otpDispatchResult);
    phoneConfirmationMessage = phoneConfirmationRequired
      ? "Enter the phone number shown for this verification option."
      : readPartnaResponseMessage(otpDispatchResult);
  } catch (error) {
    if (!isPartnaPhoneConfirmationRequiredError(error)) {
      throw error;
    }

    phoneConfirmationRequired = true;
    phoneConfirmationMessage = "Enter the phone number shown for this verification option.";
  }

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
        kycStatus: phoneConfirmationRequired ? "phone_confirmation_required" : "otp_pending",
        verificationMethods: storedMethods,
        selectedVerificationMethod: selectedMethod,
        selectedVerificationHint: selectedMethodRecord?.hint ?? null,
        otpDispatchMessage: phoneConfirmationMessage,
      },
    },
  };
  await customer.save();

  return {
    verificationMethod: selectedMethod,
    verificationHint: selectedMethodRecord?.hint ?? null,
    phoneConfirmationRequired,
    phoneConfirmationMessage,
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
  payment: {
    collection: {
      fxRate?: number | null;
      feeAmount?: number | null;
    };
    metadata?: unknown;
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
    fxRate: input.payment.collection.fxRate ?? 0,
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
  const metadata = asRecord(input.payment.metadata) ?? {};

  input.payment.metadata = {
    ...metadata,
    ...(voucherFeeLocal !== null ? { voucherFeeLocal } : {}),
    ...(voucherWavedFeeLocal !== null ? { voucherWavedFeeLocal } : {}),
    ...(feeBearer ? { feeBearer } : {}),
    ...(input.redeemResult ? { redeemResult: input.redeemResult } : {}),
  };

  if (feeAmountUsdc !== null) {
    input.payment.collection.feeAmount = feeAmountUsdc;
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
      externalPaymentId: extractPartnaVoucherId(payload),
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

  const payment = await PaymentModel.findOne({
    "collection.externalId": voucherId,
    "collection.provider": "partna",
    ...createRuntimeModeCondition("environment", environment),
  }).exec();

  if (!payment) {
    webhookEvent.result = {
      processed: false,
      matched: false,
      state,
      externalPaymentId: voucherId,
    };
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();

    return webhookEvent.result as Record<string, unknown>;
  }

  const linkedSettlement = await PayoutModel.findOne({
    sourcePaymentId: payment._id,
    ...createRuntimeModeCondition("environment", environment),
  })
    .sort({ createdAt: -1 })
    .exec();

  const previousPaymentStatus = payment.status;
  const voucherCode =
    extractPartnaVoucherCode(payload) ??
    readString(asRecord(payment.metadata)?.voucherCode);
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
        readString(asRecord(payment.metadata)?.email) ??
        "",
      voucherCode,
      currency: "USDC",
      network: "solana",
      cryptoAddress: settlementAuthority.publicKey.toBase58(),
    });

    payment.status = linkedSettlement ? "settling" : "paid";
    payment.collection.status = "paid";
    payment.collection.paidAt = payment.collection.paidAt ?? new Date();
    payment.metadata = {
      ...(asRecord(payment.metadata) ?? {}),
      voucherCode,
      voucherId,
      email:
        readString(payloadData?.email) ??
        readString(asRecord(payment.metadata)?.email) ??
        null,
    };
    await applyPartnaFeeState({
      payment,
      linkedSettlement,
      payloadData,
      redeemResult: asRecord(redeemResult) ?? null,
    });
    await payment.save();

    if (
      previousPaymentStatus !== "paid" &&
      previousPaymentStatus !== "settling" &&
      previousPaymentStatus !== "settled"
    ) {
      const stableAmount = payment.collection.stableAmount ?? null;

      if (payment.customerId && stableAmount !== null) {
        await CustomerModel.findByIdAndUpdate(payment.customerId, {
          $inc: { monthlyVolumeUsdc: stableAmount },
        }).exec();
      }
    }

    if (linkedSettlement) {
      await queuePayoutProcessing(linkedSettlement._id.toString(), {
        merchantId: linkedSettlement.merchantId.toString(),
        environment,
      });
    }
  } else if (state.includes("failed") || state.includes("cancel")) {
    payment.status = "failed";
    payment.collection.status = "failed";
    payment.metadata = {
      ...(asRecord(payment.metadata) ?? {}),
      voucherId,
      voucherCode,
      failureCode: state,
    };
    await applyPartnaFeeState({
      payment,
      linkedSettlement,
      payloadData,
    });
    await payment.save();

    if (linkedSettlement && linkedSettlement.status !== "settled") {
      linkedSettlement.status = "failed";
      await linkedSettlement.save();
    }
  } else {
    if (
      payment.status !== "paid" &&
      payment.status !== "settling" &&
      payment.status !== "settled"
    ) {
      payment.status = "pending";
      payment.collection.status = "pending";
    }
    payment.metadata = {
      ...(asRecord(payment.metadata) ?? {}),
      voucherId,
      voucherCode,
    };
    await applyPartnaFeeState({
      payment,
      linkedSettlement,
      payloadData,
    });
    await payment.save();
  }

  await emitPaymentWebhookEventForStatusChange({
    previousStatus: previousPaymentStatus,
    paymentId: payment._id.toString(),
    nextStatus: payment.status,
  });

  const result = {
    processed: true,
    matched: true,
    state,
    externalPaymentId: payment.collection.externalId ?? voucherId,
    paymentId: payment._id.toString(),
    paymentStatus: payment.status,
    payoutId: linkedSettlement?._id.toString() ?? null,
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
