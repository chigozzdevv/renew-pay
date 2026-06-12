import { createVerify, constants as cryptoConstants } from "crypto";

import { HttpError } from "@/shared/errors/http-error";

import { OnrampEventModel } from "@/features/onramps/onramp-event.model";
import { getPartnaProvider } from "@/features/onramps/providers/partna/partna.factory";
import type {
  PartnaBvnVerificationMethod,
  PartnaManagedBankAccount,
} from "@/features/onramps/providers/partna/partna.types";
import { CustomerModel } from "@/features/customers/customer.model";
import { emitPaymentWebhookEventForStatusChange } from "@/features/developers/developer-webhook-delivery.service";
import {
  queueCustomerReceiptForStatusChange,
  queueMoneyMovementNotificationForStatusChange,
} from "@/features/notifications/notification.service";
import { PaymentModel, type PaymentRecord } from "@/features/payments/payment.model";
import { queuePayoutProcessing } from "@/features/payouts/payout.service";
import { PayoutModel } from "@/features/payouts/payout.model";
import { SettlementAccountModel } from "@/features/settlement/settlement-account.model";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { getPublicApiOriginForRuntimeMode } from "@/shared/utils/public-api-host";
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
  const url = new URL(
    "/v1/onramps/webhooks/partna",
    getPublicApiOriginForRuntimeMode(mode)
  );
  return url.toString();
}

function readPartnaFeeBearer(value: unknown) {
  const normalized = readString(value)?.toLowerCase() ?? null;
  return normalized === "merchant" || normalized === "client" ? normalized : null;
}

function getSettlementReleaseAt(payment: PaymentRecord) {
  const paidAt = payment.collection.paidAt ?? new Date();

  return new Date(paidAt.getTime() + 24 * 60 * 60 * 1000);
}

function toRoundedFee(value: number) {
  return Number(Math.max(0, value).toFixed(6));
}

function normalizePartnaFxRate(rate: number | null) {
  if (rate === null || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  return rate < 1 ? Number((1 / rate).toFixed(4)) : rate;
}

export function derivePartnaFeeAmountUsdc(input: {
  fxRate: number;
  payloadData?: Record<string, unknown> | null;
}) {
  const payloadData = input.payloadData ?? null;
  const feeBearer = readPartnaFeeBearer(payloadData?.feeBearer);

  if (feeBearer === "client") {
    return 0;
  }

  const destinationCurrency = readString(payloadData?.toCurrency)?.toUpperCase() ?? null;
  const destinationFee =
    readNumber(payloadData?.totalFeesInToCurrency) ??
    readNumber(payloadData?.feeInToCurrency) ??
    null;

  if ((destinationCurrency === "USDC" || destinationCurrency === null) && destinationFee !== null) {
    return toRoundedFee(destinationFee);
  }

  const localFee =
    readNumber(payloadData?.totalFeesInFromCurrency) ??
    readNumber(payloadData?.feeInFromCurrency) ??
    readNumber(payloadData?.fee) ??
    null;

  if (localFee !== null && Number.isFinite(input.fxRate) && input.fxRate > 0) {
    return toRoundedFee(localFee / input.fxRate);
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

export function buildPartnaCustomerAccountName(customer: {
  customerRef: string;
  _id: { toString(): string };
}) {
  const accountId = customer._id
    .toString()
    .toLowerCase()
    .replace(/[^a-f0-9]+/g, "")
    .slice(0, 40);

  if (accountId.length >= 2) {
    return accountId;
  }

  return "aa";
}

function readPartnaResponseMessage(payload: Record<string, unknown> | null) {
  return readString(payload?.message);
}

function readPartnaResponseOtp(payload: Record<string, unknown> | null) {
  const stack = payload ? [payload] : [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        stack.push(value as Record<string, unknown>);
        continue;
      }

      const normalizedKey = key.replace(/[_-]+/g, "").toLowerCase();
      if (normalizedKey !== "otp" && normalizedKey !== "verificationcode") {
        continue;
      }

      const normalizedValue =
        typeof value === "number" ? value.toString() : readString(value);
      if (normalizedValue && /^\d{4,8}$/.test(normalizedValue)) {
        return normalizedValue;
      }
    }
  }

  return null;
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

function isPartnaOtpConfirmationError(error: unknown) {
  return (
    error instanceof HttpError &&
    /otp|verification code|code|expired|session/i.test(error.message)
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
    partna?: {
      accountName?: string | null;
    } | null;
  } | null;
} | null, currency?: string | null) {
  return (
    Boolean(customer) &&
    customer?.paymentProfile?.provider === "partna" &&
    customer?.paymentProfile?.status === "active" &&
    Boolean(customer?.paymentProfile?.partna?.accountName) &&
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
    kesMobileNetwork?: string | null;
    kesShortcode?: string | null;
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
    kesMobileNetwork: input.verification.kesMobileNetwork,
    kesShortcode: input.verification.kesShortcode,
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
    accountNumber?: string | null;
    bankCode?: string | null;
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
      currency: customer.market,
      accountNumber: input.verification.accountNumber,
      bankCode: input.verification.bankCode,
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
        selectedAccountNumber: input.verification.accountNumber?.trim() ?? null,
        selectedBankCode: input.verification.bankCode?.trim() ?? null,
        otpDispatchMessage: phoneConfirmationMessage,
        sandboxOtp:
          input.environment === "test" ? readPartnaResponseOtp(otpDispatchResult) : null,
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
    currency: customer.market,
    accountNumber: readString(existingRaw.selectedAccountNumber),
    bankCode: readString(existingRaw.selectedBankCode),
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
        sandboxOtp:
          input.environment === "test" ? readPartnaResponseOtp(otpDispatchResult) : null,
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
  try {
    await provider.confirmBvnOtp({
      accountName,
      currency: customer.market,
      otp: input.verification.otp,
    });
  } catch (error) {
    if (!isPartnaOtpConfirmationError(error)) {
      throw error;
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
          kycStatus: "otp_pending",
          otpDispatchMessage: "Verification code is invalid or expired.",
        },
      },
    };
    await customer.save();

    throw new HttpError(409, "Verification code is invalid or expired.");
  }

  const verifiedBankAccount = await provider.createBankAccount({
    accountName,
    currency: customer.market,
    preferredAccountName: customer.name,
  });

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
  const id =
    readString(data.rampReference) ??
    readString(data.transactionReference) ??
    readString(data.reference) ??
    readString(data.id) ??
    "none";
  const status = readString(data.status) ?? "none";
  return `partna:${environment}:${event}:${id}:${status}`;
}

function normalizePartnaWebhookState(payload: PartnaWebhookPayload) {
  const event = readString(payload.event)?.toLowerCase() ?? "unknown";
  const status = readString(asRecord(payload.data)?.status)?.toLowerCase();
  return status ? `${event}:${status}` : event;
}

function extractPartnaRampReference(payload: PartnaWebhookPayload) {
  const data = asRecord(payload.data);
  return (
    readString(data?.rampReference) ??
    readString(data?.transactionReference) ??
    readString(data?.reference) ??
    readString(data?.id)
  );
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
}) {
  const feeAmountUsdc = derivePartnaFeeAmountUsdc({
    fxRate: input.payment.collection.fxRate ?? 0,
    payloadData: input.payloadData ?? null,
  });
  const rampFeeLocal =
    readNumber(input.payloadData?.totalFeesInFromCurrency) ??
    readNumber(input.payloadData?.feeInFromCurrency) ??
    readNumber(input.payloadData?.fee) ??
    null;
  const rampWaivedFeeLocal = readNumber(input.payloadData?.wavedFee);
  const feeBearer = readPartnaFeeBearer(input.payloadData?.feeBearer);
  const metadata = asRecord(input.payment.metadata) ?? {};
  const existingRamp = asRecord(metadata.partnaRamp) ?? {};

  input.payment.metadata = {
    ...metadata,
    ...(rampFeeLocal !== null ? { rampFeeLocal } : {}),
    ...(rampWaivedFeeLocal !== null ? { rampWaivedFeeLocal } : {}),
    ...(feeBearer ? { feeBearer } : {}),
    ...(input.payloadData ? { partnaRamp: { ...existingRamp, ...input.payloadData } } : {}),
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
      Math.max(0, input.linkedSettlement.grossUsdc - feeAmountUsdc).toFixed(6)
    );
    await input.linkedSettlement.save();
  }

  return {
    feeAmountUsdc,
  };
}

async function createPayoutForPartnaPayment(
  payment: PaymentRecord,
  environment: RuntimeMode
) {
  const existingPayout = await PayoutModel.findOne({
    sourcePaymentId: payment._id,
    ...createRuntimeModeCondition("environment", environment),
  })
    .sort({ createdAt: -1 })
    .exec();

  if (existingPayout) {
    return existingPayout;
  }

  if (!payment.settlementAccountId) {
    throw new HttpError(409, "Payment does not have a settlement account.");
  }

  const account = await SettlementAccountModel.findById(
    payment.settlementAccountId
  ).exec();

  if (!account?.destinationAddress) {
    throw new HttpError(409, "Payment settlement account is not configured.");
  }

  const grossUsdc = Number((payment.collection.stableAmount ?? 0).toFixed(6));

  if (grossUsdc <= 0) {
    throw new HttpError(409, "Payment is missing settlement amount.");
  }

  const feeUsdc = Number((payment.collection.feeAmount ?? 0).toFixed(6));
  const netUsdc = Number(Math.max(0, grossUsdc - feeUsdc).toFixed(6));

  if (netUsdc <= 0) {
    throw new HttpError(409, "Payment settlement amount is fully consumed by fees.");
  }

  return PayoutModel.create({
    merchantId: payment.merchantId,
    environment,
    sourcePaymentId: payment._id,
    batchRef: `pay:${payment.payId}`,
    sourceKind: "payment",
    commercialRef: payment.payId,
    localAmount: payment.collection.localAmount ?? payment.amount,
    fxRate: payment.collection.fxRate ?? null,
    grossUsdc,
    feeUsdc,
    netUsdc,
    destinationWallet: account.destinationAddress,
    status: "queued",
    scheduledFor: getSettlementReleaseAt(payment),
  });
}

function eventIsRampSuccess(payload: PartnaWebhookPayload) {
  const status = readString(asRecord(payload.data)?.status)?.toLowerCase() ?? "";

  return ["completed", "complete", "success", "paid"].includes(status);
}

function partnaRampRecordIsConfirmed(record: {
  status?: string | null;
  raw?: Record<string, unknown> | null;
}) {
  const status = readString(record.status)?.toLowerCase() ?? "";
  const raw = asRecord(record.raw) ?? {};

  return (
    ["completed", "complete", "success", "paid"].includes(status) ||
    raw.confirmed === true
  );
}

function partnaMockFiatDepositSucceeded(value: unknown) {
  const record = asRecord(value);

  if (!record) {
    return false;
  }

  if (record.success === true || record.confirmed === true) {
    return true;
  }

  const status = readString(record.status)?.toLowerCase() ?? "";
  const message = readString(record.message)?.toLowerCase() ?? "";

  return (
    ["completed", "complete", "success", "paid"].includes(status) ||
    message.includes("success")
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

  const existingEvent = await OnrampEventModel.findOne({
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
      externalPaymentId: extractPartnaRampReference(payload),
    };
  }

  let webhookEvent = existingEvent;
  const rampReference = extractPartnaRampReference(payload);
  const payloadData = asRecord(payload.data) ?? null;

  if (!webhookEvent) {
    webhookEvent = await OnrampEventModel.create({
      provider: "partna",
      environment,
      eventKey,
      state,
      externalId: rampReference,
      sequenceId: rampReference,
      payload,
    });
  }

  if (!rampReference) {
    webhookEvent.result = {
      processed: false,
      matched: false,
      reason: "missing_ramp_reference",
      state,
    };
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();

    return webhookEvent.result as Record<string, unknown>;
  }

  const payment = await PaymentModel.findOne({
    "collection.externalId": rampReference,
    "collection.provider": "partna",
    ...createRuntimeModeCondition("environment", environment),
  }).exec();

  if (!payment) {
    webhookEvent.result = {
      processed: false,
      matched: false,
      state,
      externalPaymentId: rampReference,
    };
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();

    return webhookEvent.result as Record<string, unknown>;
  }

  let linkedSettlement = await PayoutModel.findOne({
    sourcePaymentId: payment._id,
    ...createRuntimeModeCondition("environment", environment),
  })
    .sort({ createdAt: -1 })
    .exec();

  const previousPaymentStatus = payment.status;
  let payoutQueueError: string | null = null;

  if (eventIsRampSuccess(payload)) {
    const rampToAmount = readNumber(payloadData?.toAmount);
    const rampFromAmount = readNumber(payloadData?.fromAmount);
    const rampRate = normalizePartnaFxRate(readNumber(payloadData?.currentRate));

    payment.collection.status = "paid";
    payment.collection.paidAt = payment.collection.paidAt ?? new Date();
    payment.collection.stableAmount = rampToAmount ?? payment.collection.stableAmount;
    payment.collection.localAmount =
      rampFromAmount ?? payment.collection.localAmount ?? payment.amount;
    payment.collection.fxRate = rampRate ?? payment.collection.fxRate;
    payment.metadata = {
      ...(asRecord(payment.metadata) ?? {}),
      partnaRamp: {
        ...(asRecord(asRecord(payment.metadata)?.partnaRamp) ?? {}),
        ...(payloadData ?? {}),
        rampReference,
        status: readString(payloadData?.status) ?? null,
      },
      email:
        readString(payloadData?.email) ??
        readString(asRecord(payment.metadata)?.email) ??
        readString(asRecord(payment.metadata)?.payerEmail) ??
        null,
    };
    await applyPartnaFeeState({
      payment,
      linkedSettlement,
      payloadData,
    });

    if (!linkedSettlement) {
      linkedSettlement = await createPayoutForPartnaPayment(payment, environment);
    }

    payment.status = linkedSettlement ? "settling" : "paid";
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
      try {
        await queuePayoutProcessing(linkedSettlement._id.toString(), {
          merchantId: linkedSettlement.merchantId.toString(),
          environment,
        });
      } catch (error) {
        payoutQueueError =
          error instanceof Error ? error.message : "Payout processing failed.";
      }
    }
  } else if (state.includes("failed") || state.includes("cancel")) {
    payment.status = "failed";
    payment.collection.status = "failed";
    payment.metadata = {
      ...(asRecord(payment.metadata) ?? {}),
      failureCode: state,
      partnaRamp: {
        ...(asRecord(asRecord(payment.metadata)?.partnaRamp) ?? {}),
        ...(payloadData ?? {}),
        rampReference,
        status: readString(payloadData?.status) ?? null,
      },
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
      partnaRamp: {
        ...(asRecord(asRecord(payment.metadata)?.partnaRamp) ?? {}),
        ...(payloadData ?? {}),
        rampReference,
        status: readString(payloadData?.status) ?? null,
      },
    };
    await applyPartnaFeeState({
      payment,
      linkedSettlement,
      payloadData,
    });
    await payment.save();
  }

  await Promise.all([
    emitPaymentWebhookEventForStatusChange({
      previousStatus: previousPaymentStatus,
      paymentId: payment._id.toString(),
      nextStatus: payment.status,
    }).catch(() => undefined),
    queueMoneyMovementNotificationForStatusChange({
      previousStatus: previousPaymentStatus,
      paymentId: payment._id.toString(),
      nextStatus: payment.status,
    }).catch(() => undefined),
    queueCustomerReceiptForStatusChange({
      previousStatus: previousPaymentStatus,
      paymentId: payment._id.toString(),
      nextStatus: payment.status,
    }).catch(() => undefined),
  ]);

  const result = {
    processed: true,
    matched: true,
    state,
    externalPaymentId: payment.collection.externalId ?? rampReference,
    paymentId: payment._id.toString(),
    paymentStatus: payment.status,
    payoutId: linkedSettlement?._id.toString() ?? null,
    ...(payoutQueueError ? { payoutQueueError } : {}),
  };

  webhookEvent.result = result;
  webhookEvent.processedAt = new Date();
  await webhookEvent.save();

  return result;
}

export async function confirmPartnaRampPayment(input: {
  payment: PaymentRecord;
  environment: RuntimeMode;
}) {
  const metadata = asRecord(input.payment.metadata) ?? {};
  let rampMetadata = asRecord(metadata.partnaRamp) ?? {};
  let sandboxMockPaymentConfirmed =
    input.environment === "test" &&
    partnaMockFiatDepositSucceeded(rampMetadata.mockFiatDeposit);
  const rampReference =
    input.payment.collection.externalId ?? readString(rampMetadata.rampReference);

  if (!rampReference) {
    throw new HttpError(409, "Collection is not ready for confirmation.");
  }

  const customer = input.payment.customerId
    ? await CustomerModel.findById(input.payment.customerId).lean().exec()
    : null;
  const accountName =
    readString(customer?.paymentProfile?.partna?.accountName) ??
    readString(rampMetadata.partnaAccountName);

  if (!accountName) {
    throw new HttpError(409, "Customer payment account is not ready.");
  }

  const provider = getPartnaProvider(input.environment);
  let ramps = await provider.getRampRequests({
    accountName,
    rampReference,
  });
  let ramp =
    ramps.find((entry) => entry.rampReference === rampReference) ?? ramps[0] ?? null;

  const shouldSimulateSandboxPayment =
    input.environment === "test" &&
    ramp &&
    !partnaRampRecordIsConfirmed(ramp) &&
    !readString(rampMetadata.mockFiatDepositRequestedAt);

  if (shouldSimulateSandboxPayment) {
    const mockAmount = ramp.fromAmount ?? input.payment.amount;
    const mockCurrency = ramp.fromCurrency ?? input.payment.currency;

    if (Number.isFinite(mockAmount) && mockAmount > 0 && mockCurrency) {
      const mockResult = await provider.mockFiatDeposit({
        accountName,
        amount: mockAmount,
        currency: mockCurrency,
        username: accountName,
      });
      sandboxMockPaymentConfirmed = true;

      rampMetadata = {
        ...rampMetadata,
        mockFiatDepositRequestedAt: new Date().toISOString(),
        mockFiatDeposit: mockResult,
      };

      ramps = await provider.getRampRequests({
        accountName,
        rampReference,
      });
      ramp =
        ramps.find((entry) => entry.rampReference === rampReference) ??
        ramps[0] ??
        ramp;
    }
  }

  const rampConfirmed = ramp ? partnaRampRecordIsConfirmed(ramp) : false;
  const paymentConfirmed = rampConfirmed || sandboxMockPaymentConfirmed;
  const confirmedStatus = sandboxMockPaymentConfirmed
    ? "completed"
    : ramp?.status ?? "paid";

  input.payment.metadata = {
    ...metadata,
    partnaRamp: {
      ...rampMetadata,
      ...(ramp?.raw ?? {}),
      rampReference,
      partnaAccountName: accountName,
      status: paymentConfirmed
        ? confirmedStatus
        : ramp?.status ?? readString(rampMetadata.status) ?? null,
      providerStatus: ramp?.status ?? readString(rampMetadata.status) ?? null,
      confirmed: paymentConfirmed,
      checkedAt: new Date().toISOString(),
    },
  };
  await input.payment.save();

  if (!paymentConfirmed) {
    return {
      confirmed: false,
      status: ramp?.status ?? null,
    };
  }

  const result = await processPartnaWebhook(
    {
      event: "ramp.confirmed",
      data: {
        ...(ramp?.raw ?? {}),
        rampReference,
        status: confirmedStatus,
        confirmed: true,
        fromAmount:
          ramp?.fromAmount ?? input.payment.collection.localAmount ?? input.payment.amount,
        fromCurrency: ramp?.fromCurrency ?? input.payment.currency,
        toAmount: ramp?.toAmount ?? input.payment.collection.stableAmount ?? null,
        toCurrency: ramp?.toCurrency ?? "USDC",
        currentRate: ramp?.currentRate ?? input.payment.collection.fxRate ?? null,
      },
    },
    input.environment
  );

  return {
    confirmed: true,
    status: confirmedStatus,
    result,
  };
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

export const __test__ = {
  extractPartnaRampReference,
  partnaMockFiatDepositSucceeded,
};
