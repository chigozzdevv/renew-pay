import { randomBytes } from "crypto";

import { Types } from "mongoose";

import { getDefaultPaymentRailProvider } from "@/config/payment-rail.config";
import { ChargeModel } from "@/features/charges/charge.model";
import { CustomerModel } from "@/features/customers/customer.model";
import { InvoiceModel } from "@/features/invoices/invoice.model";
import type {
  CreateInvoiceInput,
  ListInvoicesQuery,
  SubmitInvoiceVerificationInput,
  UpdateInvoiceInput,
} from "@/features/invoices/invoice.validation";
import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  queueInvoiceIssuedNotification,
  queueInvoicePaidNotifications,
  queueInvoiceReminderNotification,
} from "@/features/notifications/notification.service";
import { quoteUsdAmountInBillingCurrency } from "@/features/payment-rails/payment-rails.service";
import {
  buildPartnaOtpVerificationSnapshot,
  buildPartnaVerificationSnapshot,
  createPartnaChargeInstruction,
  completePartnaCustomerPaymentProfileVerification,
  derivePartnaFeeAmountUsdc,
  hasActivePartnaPaymentProfile,
  processPartnaWebhook,
  startPartnaCustomerPaymentProfileVerification,
} from "@/features/payment-rails/partna.service";
import { getPartnaProvider } from "@/features/payment-rails/providers/partna/partna.factory";
import { getOrCreateMerchantSetting } from "@/features/settings/setting.factory";
import { createSettlement } from "@/features/settlements/settlement.service";
import { SettlementModel } from "@/features/settlements/settlement.model";
import { getTreasuryByMerchantId } from "@/features/treasury/treasury.service";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";
import {
  buildPagination,
  resolvePagination,
  type ListResult,
} from "@/shared/utils/pagination";
import {
  createRuntimeModeCondition,
  toPublicEnvironment,
  toStoredRuntimeMode,
} from "@/shared/utils/runtime-environment";

type InvoiceRuntimeStatus =
  | "draft"
  | "issued"
  | "pending_payment"
  | "processing"
  | "paid"
  | "overdue"
  | "void";

function toNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function buildCustomerHost(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "https://app.renew.sh";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return trimTrailingSlash(normalized);
  }

  return `https://${trimTrailingSlash(normalized)}`;
}

function buildInvoicePublicUrl(customerDomain: string, publicToken: string) {
  return `${buildCustomerHost(customerDomain)}/invoices/${publicToken}`;
}

function buildCustomerRef(email: string) {
  const normalized = email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const suffix = randomBytes(4).toString("hex");
  return `cust_${normalized.slice(0, 24).replace(/^-+|-+$/g, "") || "invoice"}_${suffix}`;
}

function createInvoicePublicToken() {
  return `inv_${randomBytes(20).toString("hex")}`;
}

function normalizeInvoiceLineItems(
  lineItems: CreateInvoiceInput["lineItems"] | NonNullable<UpdateInvoiceInput["lineItems"]>
) {
  return lineItems.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmountUsd: Number(item.unitAmountUsd.toFixed(2)),
    totalAmountUsd: Number((item.quantity * item.unitAmountUsd).toFixed(2)),
  }));
}

function sumInvoiceUsdAmount(
  lineItems: ReturnType<typeof normalizeInvoiceLineItems>
) {
  return Number(
    lineItems.reduce((sum, item) => sum + item.totalAmountUsd, 0).toFixed(2)
  );
}

function invoiceDueHasPassed(dueDate: Date) {
  return dueDate.getTime() < Date.now();
}

function deriveInvoiceStatus(input: {
  currentStatus: string;
  dueDate: Date;
  chargeStatus?: string | null;
  settlementStatus?: string | null;
}) {
  if (input.currentStatus === "void") {
    return "void" as const;
  }

  if (input.chargeStatus === "settled" || input.settlementStatus === "settled") {
    return "paid" as const;
  }

  if (
    input.chargeStatus === "awaiting_settlement" ||
    input.settlementStatus === "queued" ||
    input.settlementStatus === "confirming"
  ) {
    return "processing" as const;
  }

  if (input.chargeStatus === "pending") {
    return "pending_payment" as const;
  }

  if (input.currentStatus === "draft") {
    return "draft" as const;
  }

  if (invoiceDueHasPassed(input.dueDate)) {
    return "overdue" as const;
  }

  return "issued" as const;
}

function deriveInvoiceNextAction(input: {
  status: InvoiceRuntimeStatus;
  environment: RuntimeMode;
  hasPaymentProfile: boolean;
  hasCharge: boolean;
}) {
  if (input.status === "draft" || input.status === "void" || input.status === "paid") {
    return "none" as const;
  }

  if (input.status === "pending_payment") {
    return input.environment === "test" && input.hasCharge
      ? ("complete_test_payment" as const)
      : ("show_payment_instructions" as const);
  }

  if (input.status === "processing") {
    return "wait_for_settlement" as const;
  }

  if (!input.hasPaymentProfile) {
    return "complete_verification" as const;
  }

  return "create_payment" as const;
}

async function ensureInvoiceScope(
  invoiceId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const mongoQuery: Record<string, unknown> = {
    _id: invoiceId,
  };

  if (merchantId) {
    mongoQuery.merchantId = merchantId;
  }

  if (environment) {
    Object.assign(mongoQuery, createRuntimeModeCondition("environment", environment));
  }

  const invoice = await InvoiceModel.findOne(mongoQuery).exec();

  if (!invoice) {
    throw new HttpError(404, "Invoice was not found.");
  }

  return invoice;
}

async function ensurePublicInvoice(publicToken: string) {
  const invoice = await InvoiceModel.findOne({ publicToken }).exec();

  if (!invoice) {
    throw new HttpError(404, "Invoice was not found.");
  }

  return invoice;
}

async function ensureMerchantSupportsInvoice(input: {
  merchantId: string;
  environment: RuntimeMode;
  billingCurrency: string;
}) {
  const merchant = await MerchantModel.findById(input.merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  if (!merchant.supportedMarkets.includes(input.billingCurrency)) {
    throw new HttpError(
      409,
      `Currency ${input.billingCurrency} is not enabled for this merchant.`
    );
  }

  return merchant;
}

async function generateInvoiceNumber(
  merchantId: string,
  environment: RuntimeMode,
  prefix: string
) {
  const sanitizedPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "") || "RNL";
  const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${sanitizedPrefix}-${dateCode}-${randomBytes(3)
      .toString("hex")
      .toUpperCase()}`;
    const existing = await InvoiceModel.exists({
      merchantId,
      invoiceNumber: candidate,
      ...createRuntimeModeCondition("environment", environment),
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new HttpError(500, "Invoice number could not be generated.");
}

async function upsertInvoiceCustomer(input: {
  merchantId: string;
  environment: RuntimeMode;
  customerName: string;
  customerEmail: string;
  billingCurrency: string;
}) {
  const existing = await CustomerModel.findOne({
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
    email: input.customerEmail.trim().toLowerCase(),
  }).exec();

  if (existing) {
    if (existing.status === "blacklisted") {
      throw new HttpError(409, "Customer is blacklisted.");
    }

    const marketChanged = existing.market !== input.billingCurrency;

    existing.name = input.customerName;
    existing.market = input.billingCurrency;

    if (
      marketChanged &&
      existing.paymentProfile?.bankTransfer?.currency &&
      existing.paymentProfile.bankTransfer.currency !== input.billingCurrency
    ) {
      existing.paymentProvider = null;
      existing.paymentProfile = null;
      existing.paymentMethodState = "missing";
    }

    await existing.save();
    return existing;
  }

  return CustomerModel.create({
    merchantId: input.merchantId,
    environment: input.environment,
    customerRef: buildCustomerRef(input.customerEmail),
    name: input.customerName,
    email: input.customerEmail,
    market: input.billingCurrency,
    status: "active",
    billingState: "healthy",
    paymentMethodState: "ok",
    subscriptionCount: 0,
    monthlyVolumeUsdc: 0,
    nextRenewalAt: null,
    lastChargeAt: null,
    autoReminderEnabled: true,
    metadata: {
      source: "invoice",
    },
  });
}

async function syncInvoiceDocument(invoiceId: string) {
  const invoice = await InvoiceModel.findById(invoiceId).exec();

  if (!invoice) {
    throw new HttpError(404, "Invoice was not found.");
  }

  const [charge, settlement] = await Promise.all([
    invoice.chargeId ? ChargeModel.findById(invoice.chargeId).exec() : Promise.resolve(null),
    invoice.settlementId
      ? SettlementModel.findById(invoice.settlementId).exec()
      : Promise.resolve(null),
  ]);

  const nextStatus = deriveInvoiceStatus({
    currentStatus: invoice.status,
    dueDate: invoice.dueDate,
    chargeStatus: charge?.status ?? null,
    settlementStatus: settlement?.status ?? null,
  });

  invoice.status = nextStatus;

  if (charge && invoice.paymentSnapshot) {
    invoice.paymentSnapshot.status = charge.status;
  }

  if (nextStatus === "paid" && !invoice.paidAt) {
    invoice.paidAt = settlement?.settledAt ?? charge?.processedAt ?? new Date();
    await queueInvoicePaidNotifications({
      invoiceId: invoice._id.toString(),
      environment: toStoredRuntimeMode(invoice.environment),
    }).catch(() => undefined);
  }

  if (nextStatus === "void" && !invoice.voidedAt) {
    invoice.voidedAt = new Date();
  }

  await invoice.save();

  return {
    invoice,
    charge,
    settlement,
  };
}

function toInvoiceResponse(input: {
  invoice: Awaited<ReturnType<typeof ensureInvoiceScope>>;
  charge?: {
    _id: { toString(): string };
    externalChargeId: string;
    status: string;
    failureCode?: string | null;
    processedAt: Date;
  } | null;
  settlement?: {
    _id: { toString(): string };
    status: string;
    netUsdc: number;
    grossUsdc: number;
    creditTxHash?: string | null;
  } | null;
  publicUrl: string;
}) {
  const runtimeEnvironment = toStoredRuntimeMode(input.invoice.environment);

  return {
    id: input.invoice._id.toString(),
    merchantId: input.invoice.merchantId.toString(),
    environment: toPublicEnvironment(runtimeEnvironment),
    invoiceNumber: input.invoice.invoiceNumber,
    publicToken: input.invoice.publicToken,
    publicUrl: input.publicUrl,
    title: input.invoice.title,
    customerId: input.invoice.customerId?.toString() ?? null,
    customerName: input.invoice.customerName,
    customerEmail: input.invoice.customerEmail,
    billingCurrency: input.invoice.billingCurrency,
    status: input.invoice.status,
    note: input.invoice.note ?? null,
    dueDate: input.invoice.dueDate,
    issuedAt: input.invoice.issuedAt ?? null,
    sentAt: input.invoice.sentAt ?? null,
    lastRemindedAt: input.invoice.lastRemindedAt ?? null,
    paidAt: input.invoice.paidAt ?? null,
    voidedAt: input.invoice.voidedAt ?? null,
    lineItems: (input.invoice.lineItems ?? []).map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitAmountUsd: item.unitAmountUsd,
      totalAmountUsd: item.totalAmountUsd,
    })),
    totals: {
      usdAmount: input.invoice.usdAmount,
      localAmount: input.invoice.localAmount,
      fxRate: input.invoice.fxRate,
      usdcAmount: input.invoice.usdcAmount,
      feeAmount: input.invoice.feeAmount,
    },
    charge: input.charge
      ? {
          id: input.charge._id.toString(),
          externalChargeId: input.charge.externalChargeId,
          status: input.charge.status,
          failureCode: input.charge.failureCode ?? null,
          processedAt: input.charge.processedAt,
        }
      : null,
    settlement: input.settlement
      ? {
          id: input.settlement._id.toString(),
          status: input.settlement.status,
          netUsdc: input.settlement.netUsdc,
          grossUsdc: input.settlement.grossUsdc,
          creditTxHash: input.settlement.creditTxHash ?? null,
        }
      : null,
    paymentInstructions: input.invoice.paymentSnapshot
      ? {
          provider: input.invoice.paymentSnapshot.provider ?? null,
          kind: input.invoice.paymentSnapshot.kind ?? null,
          externalChargeId: input.invoice.paymentSnapshot.externalChargeId ?? null,
          billingCurrency: input.invoice.paymentSnapshot.billingCurrency ?? null,
          localAmount: input.invoice.paymentSnapshot.localAmount ?? null,
          usdcAmount: input.invoice.paymentSnapshot.usdcAmount ?? null,
          feeAmount: input.invoice.paymentSnapshot.feeAmount ?? null,
          status: input.invoice.paymentSnapshot.status ?? null,
          reference: input.invoice.paymentSnapshot.reference ?? null,
          expiresAt: input.invoice.paymentSnapshot.expiresAt ?? null,
          redirectUrl: input.invoice.paymentSnapshot.redirectUrl ?? null,
          bankTransfer: input.invoice.paymentSnapshot.bankTransfer
            ? {
                bankCode: input.invoice.paymentSnapshot.bankTransfer.bankCode ?? null,
                bankName: input.invoice.paymentSnapshot.bankTransfer.bankName ?? null,
                accountNumber:
                  input.invoice.paymentSnapshot.bankTransfer.accountNumber ?? null,
                accountName:
                  input.invoice.paymentSnapshot.bankTransfer.accountName ?? null,
                currency: input.invoice.paymentSnapshot.bankTransfer.currency ?? null,
              }
            : null,
        }
      : null,
    createdAt: input.invoice.createdAt,
    updatedAt: input.invoice.updatedAt,
  };
}

async function toPublicInvoiceResponse(input: {
  invoice: Awaited<ReturnType<typeof ensurePublicInvoice>>;
  charge?: {
    _id: { toString(): string };
    externalChargeId: string;
    status: string;
    failureCode?: string | null;
    processedAt: Date;
  } | null;
  settlement?: {
    _id: { toString(): string };
    status: string;
    netUsdc: number;
    grossUsdc: number;
    creditTxHash?: string | null;
    bridgeSourceTxHash?: string | null;
    bridgeReceiveTxHash?: string | null;
  } | null;
}) {
  const customer = input.invoice.customerId
    ? await CustomerModel.findById(input.invoice.customerId)
        .select({ paymentProfile: 1 })
        .lean()
        .exec()
    : null;
  const runtimeEnvironment = toStoredRuntimeMode(input.invoice.environment);
  const hasPaymentProfile = hasActivePartnaPaymentProfile(
    customer ?? null,
    input.invoice.billingCurrency
  );
  const status = deriveInvoiceStatus({
    currentStatus: input.invoice.status,
    dueDate: input.invoice.dueDate,
    chargeStatus: input.charge?.status ?? null,
    settlementStatus: input.settlement?.status ?? null,
  });

  return {
    invoiceNumber: input.invoice.invoiceNumber,
    publicToken: input.invoice.publicToken,
    title: input.invoice.title,
    customerName: input.invoice.customerName,
    customerEmail: input.invoice.customerEmail,
    billingCurrency: input.invoice.billingCurrency,
    status,
    note: input.invoice.note ?? null,
    dueDate: input.invoice.dueDate,
    issuedAt: input.invoice.issuedAt ?? null,
    paidAt: input.invoice.paidAt ?? null,
    lineItems: (input.invoice.lineItems ?? []).map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitAmountUsd: item.unitAmountUsd,
      totalAmountUsd: item.totalAmountUsd,
    })),
    totals: {
      usdAmount: input.invoice.usdAmount,
      localAmount: input.invoice.localAmount,
      fxRate: input.invoice.fxRate,
      usdcAmount: input.invoice.usdcAmount,
      feeAmount: input.invoice.feeAmount,
    },
    nextAction: deriveInvoiceNextAction({
      status,
      environment: runtimeEnvironment,
      hasPaymentProfile,
      hasCharge: Boolean(input.invoice.chargeId),
    }),
    verification: !hasPaymentProfile && status !== "paid" && status !== "void"
      ? input.invoice.verificationSnapshot ?? buildPartnaVerificationSnapshot(input.invoice.billingCurrency)
      : null,
    charge: input.charge
      ? {
          id: input.charge._id.toString(),
          externalChargeId: input.charge.externalChargeId,
          status: input.charge.status,
          failureCode: input.charge.failureCode ?? null,
          processedAt: input.charge.processedAt,
        }
      : null,
    settlement: input.settlement
      ? {
          id: input.settlement._id.toString(),
          status: input.settlement.status,
          netUsdc: input.settlement.netUsdc,
          grossUsdc: input.settlement.grossUsdc,
          creditTxHash: input.settlement.creditTxHash ?? null,
          bridgeSourceTxHash: input.settlement.bridgeSourceTxHash ?? null,
          bridgeReceiveTxHash: input.settlement.bridgeReceiveTxHash ?? null,
        }
      : null,
    paymentInstructions: input.invoice.paymentSnapshot
      ? {
          provider: input.invoice.paymentSnapshot.provider ?? null,
          kind: input.invoice.paymentSnapshot.kind ?? null,
          externalChargeId: input.invoice.paymentSnapshot.externalChargeId ?? null,
          billingCurrency: input.invoice.paymentSnapshot.billingCurrency ?? null,
          localAmount: input.invoice.paymentSnapshot.localAmount ?? null,
          usdcAmount: input.invoice.paymentSnapshot.usdcAmount ?? null,
          feeAmount: input.invoice.paymentSnapshot.feeAmount ?? null,
          status: input.invoice.paymentSnapshot.status ?? null,
          reference: input.invoice.paymentSnapshot.reference ?? null,
          expiresAt: input.invoice.paymentSnapshot.expiresAt ?? null,
          redirectUrl: input.invoice.paymentSnapshot.redirectUrl ?? null,
          bankTransfer: input.invoice.paymentSnapshot.bankTransfer
            ? {
                bankCode: input.invoice.paymentSnapshot.bankTransfer.bankCode ?? null,
                bankName: input.invoice.paymentSnapshot.bankTransfer.bankName ?? null,
                accountNumber:
                  input.invoice.paymentSnapshot.bankTransfer.accountNumber ?? null,
                accountName:
                  input.invoice.paymentSnapshot.bankTransfer.accountName ?? null,
                currency: input.invoice.paymentSnapshot.bankTransfer.currency ?? null,
              }
            : null,
        }
      : null,
    testMode: {
      enabled: runtimeEnvironment === "test",
      canCompletePayment:
        runtimeEnvironment === "test" &&
        (status === "pending_payment" || status === "processing"),
    },
  };
}

async function ensureInvoiceEditable(invoice: Awaited<ReturnType<typeof ensureInvoiceScope>>) {
  if (invoice.status === "paid") {
    throw new HttpError(409, "Paid invoices cannot be edited.");
  }

  if (invoice.status === "void") {
    throw new HttpError(409, "Voided invoices cannot be edited.");
  }

  if (invoice.chargeId || invoice.settlementId) {
    throw new HttpError(
      409,
      "Invoice payment has already started. Create a new invoice to change the commercial terms."
    );
  }
}

async function createInvoicePaymentAttempt(
  invoice: Awaited<ReturnType<typeof ensurePublicInvoice>>
) {
  const runtimeEnvironment = toStoredRuntimeMode(invoice.environment);
  const paymentProvider = getDefaultPaymentRailProvider(runtimeEnvironment);

  if (paymentProvider !== "partna") {
    throw new HttpError(
      409,
      "Invoice payment instructions are only implemented for Partna right now."
    );
  }

  if (!invoice.customerId) {
    throw new HttpError(409, "Invoice customer is not ready.");
  }

  const customer = await CustomerModel.findById(invoice.customerId).exec();

  if (!customer) {
    throw new HttpError(404, "Invoice customer was not found.");
  }

  if (!hasActivePartnaPaymentProfile(customer, invoice.billingCurrency)) {
    invoice.verificationSnapshot = buildPartnaVerificationSnapshot(invoice.billingCurrency);
    await invoice.save();
    return getPublicInvoiceByToken(invoice.publicToken);
  }

  if (invoice.chargeId) {
    const [existingCharge, existingSettlement] = await Promise.all([
      ChargeModel.findById(invoice.chargeId).exec(),
      invoice.settlementId
        ? SettlementModel.findById(invoice.settlementId).exec()
        : Promise.resolve(null),
    ]);

    if (
      existingCharge &&
      ["pending", "awaiting_settlement", "confirming", "settled"].includes(existingCharge.status)
    ) {
      return toPublicInvoiceResponse({
        invoice,
        charge: existingCharge,
        settlement: existingSettlement,
      });
    }
  }

  const { voucher, paymentSnapshot } = await createPartnaChargeInstruction({
    environment: runtimeEnvironment,
    customerEmail: customer.email,
    customerName: customer.name,
    localAmount: invoice.localAmount,
    paymentProfile: customer.paymentProfile ?? {},
  });
  const feeAmount =
    derivePartnaFeeAmountUsdc({
      fxRate: invoice.fxRate,
      voucher,
    }) ?? invoice.feeAmount;
  const treasury = await getTreasuryByMerchantId(
    invoice.merchantId.toString(),
    runtimeEnvironment
  ).catch(() => ({
    account: null,
  }));
  const merchant = await MerchantModel.findById(invoice.merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  const charge = await ChargeModel.create({
    merchantId: invoice.merchantId,
    environment: runtimeEnvironment,
    sourceKind: "invoice",
    subscriptionId: null,
    invoiceId: invoice._id,
    externalChargeId: voucher.voucherId,
    settlementSource: merchant.payoutWallet,
    paymentProvider: "partna",
    localAmount: invoice.localAmount,
    fxRate: invoice.fxRate,
    usdcAmount: invoice.usdcAmount,
    feeAmount,
    status: "pending",
    failureCode: null,
    protocolChargeId: null,
    protocolSyncStatus: "pending_execution",
    protocolTxHash: null,
    providerMetadata: {
      email: customer.email,
      voucherCode: voucher.voucherCode,
      voucherId: voucher.voucherId,
      reference: voucher.reference,
      voucherFee: voucher.fee,
      voucherWavedFee: voucher.wavedFee,
      feeBearer: voucher.feeBearer,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice._id.toString(),
      paymentInstructions: paymentSnapshot,
      callbackUrl: customer.paymentProfile?.partna?.callbackUrl ?? null,
    },
    processedAt: new Date(),
  });

  const destinationWallet = treasury.account?.payoutWallet ?? merchant.payoutWallet;

  if (!destinationWallet) {
    throw new HttpError(409, "Merchant payout wallet is not configured.");
  }

  const settlement = await createSettlement({
    merchantId: invoice.merchantId.toString(),
    environment: runtimeEnvironment,
    sourceChargeId: charge._id.toString(),
    sourceKind: "invoice",
    batchRef: voucher.voucherId,
    commercialRef: invoice.invoiceNumber,
    grossUsdc: Number(invoice.usdcAmount.toFixed(2)),
    feeUsdc: feeAmount,
    netUsdc: Number(Math.max(0.01, invoice.usdcAmount - feeAmount).toFixed(2)),
    destinationWallet,
    localAmount: invoice.localAmount,
    fxRate: invoice.fxRate,
    status: "queued",
    scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
  });

  invoice.status = "pending_payment";
  invoice.feeAmount = feeAmount;
  invoice.paymentSnapshot = {
    provider: paymentSnapshot.provider,
    kind: paymentSnapshot.kind,
    externalChargeId: paymentSnapshot.externalChargeId,
    billingCurrency: invoice.billingCurrency,
    localAmount: invoice.localAmount,
    usdcAmount: invoice.usdcAmount,
    feeAmount,
    status: paymentSnapshot.status,
    reference: paymentSnapshot.reference,
    expiresAt: paymentSnapshot.expiresAt ?? null,
    redirectUrl: paymentSnapshot.redirectUrl ?? null,
    bankTransfer: paymentSnapshot.bankTransfer
      ? {
          bankCode: paymentSnapshot.bankTransfer.bankCode ?? null,
          bankName: paymentSnapshot.bankTransfer.bankName ?? null,
          accountNumber: paymentSnapshot.bankTransfer.accountNumber ?? null,
          accountName: paymentSnapshot.bankTransfer.accountName ?? null,
          currency: paymentSnapshot.bankTransfer.currency ?? null,
        }
      : null,
  };
  invoice.verificationSnapshot = {
    provider: "partna",
    status: "verified",
    country: "NG",
    currency: invoice.billingCurrency,
    instructions: "Permanent bank instructions are ready for this invoice.",
    requiredFields: [],
  };
  invoice.chargeId = charge._id;
  invoice.settlementId = new Types.ObjectId(settlement.id);
  await invoice.save();

  return getPublicInvoiceByToken(invoice.publicToken);
}

export async function createInvoice(input: CreateInvoiceInput) {
  await ensureMerchantSupportsInvoice({
    merchantId: input.merchantId,
    environment: input.environment,
    billingCurrency: input.billingCurrency,
  });
  const [setting, customer] = await Promise.all([
    getOrCreateMerchantSetting(input.merchantId),
    upsertInvoiceCustomer({
      merchantId: input.merchantId,
      environment: input.environment,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      billingCurrency: input.billingCurrency,
    }),
  ]);

  const lineItems = normalizeInvoiceLineItems(input.lineItems);
  const usdAmount = sumInvoiceUsdAmount(lineItems);
  const quote = await quoteUsdAmountInBillingCurrency({
    environment: input.environment,
    currency: input.billingCurrency,
    usdAmount,
  });
  const invoiceNumber = await generateInvoiceNumber(
    input.merchantId,
    input.environment,
    setting.business.invoicePrefix
  );
  const publicToken = createInvoicePublicToken();
  const now = new Date();

  const invoice = await InvoiceModel.create({
    merchantId: input.merchantId,
    environment: input.environment,
    customerId: customer._id,
    invoiceNumber,
    publicToken,
    title: input.title,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    billingCurrency: input.billingCurrency,
    status: input.status,
    note: input.note ?? null,
    lineItems,
    usdAmount,
    localAmount: quote.localAmount,
    fxRate: quote.fxRate,
    usdcAmount: quote.usdcAmount,
    feeAmount: quote.feeAmount,
    dueDate: input.dueDate,
    issuedAt: input.status === "issued" ? now : null,
    sentAt: input.status === "issued" ? now : null,
    paymentProvider: "partna",
    metadata: input.metadata ?? {},
  });

  if (input.status === "issued") {
    await queueInvoiceIssuedNotification({
      invoiceId: invoice._id.toString(),
      environment: input.environment,
    }).catch(() => undefined);
  }

  const publicUrl = buildInvoicePublicUrl(setting.business.customerDomain, publicToken);

  return toInvoiceResponse({
    invoice,
    charge: null,
    settlement: null,
    publicUrl,
  });
}

export async function listInvoices(query: ListInvoicesQuery) {
  const filters: Record<string, unknown>[] = [];

  if (query.merchantId) {
    filters.push({
      merchantId: query.merchantId,
    });
  }

  if (query.environment) {
    filters.push(createRuntimeModeCondition("environment", query.environment));
  }

  if (query.status) {
    filters.push({
      status: query.status,
    });
  }

  if (query.search) {
    const pattern = new RegExp(query.search, "i");
    filters.push({
      $or: [
        { invoiceNumber: pattern },
        { title: pattern },
        { customerEmail: pattern },
        { customerName: pattern },
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
    const invoices = await InvoiceModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .exec();
    const settingsByMerchantId = new Map<string, string>();
    const items = [];

    for (const invoice of invoices) {
      const synced = await syncInvoiceDocument(invoice._id.toString());
      const merchantId = synced.invoice.merchantId.toString();

      if (!settingsByMerchantId.has(merchantId)) {
        const setting = await getOrCreateMerchantSetting(merchantId);
        settingsByMerchantId.set(merchantId, setting.business.customerDomain);
      }

      items.push(
        toInvoiceResponse({
          invoice: synced.invoice,
          charge: synced.charge,
          settlement: synced.settlement,
          publicUrl: buildInvoicePublicUrl(
            settingsByMerchantId.get(merchantId) ?? "app.renew.sh",
            synced.invoice.publicToken
          ),
        })
      );
    }

    return {
      items,
    } satisfies ListResult<(typeof items)[number]>;
  }

  const [total, invoices] = await Promise.all([
    InvoiceModel.countDocuments(mongoQuery).exec(),
    InvoiceModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);
  const settingsByMerchantId = new Map<string, string>();
  const items = [];

  for (const invoice of invoices) {
    const synced = await syncInvoiceDocument(invoice._id.toString());
    const merchantId = synced.invoice.merchantId.toString();

    if (!settingsByMerchantId.has(merchantId)) {
      const setting = await getOrCreateMerchantSetting(merchantId);
      settingsByMerchantId.set(merchantId, setting.business.customerDomain);
    }

    items.push(
      toInvoiceResponse({
        invoice: synced.invoice,
        charge: synced.charge,
        settlement: synced.settlement,
        publicUrl: buildInvoicePublicUrl(
          settingsByMerchantId.get(merchantId) ?? "app.renew.sh",
          synced.invoice.publicToken
        ),
      })
    );
  }

  return {
    items,
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<(typeof items)[number]>;
}

export async function getInvoiceById(
  invoiceId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const scoped = await ensureInvoiceScope(invoiceId, merchantId, environment);
  const synced = await syncInvoiceDocument(scoped._id.toString());
  const setting = await getOrCreateMerchantSetting(synced.invoice.merchantId.toString());

  return toInvoiceResponse({
    invoice: synced.invoice,
    charge: synced.charge,
    settlement: synced.settlement,
    publicUrl: buildInvoicePublicUrl(setting.business.customerDomain, synced.invoice.publicToken),
  });
}

export async function updateInvoice(
  invoiceId: string,
  input: UpdateInvoiceInput,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const invoice = await ensureInvoiceScope(invoiceId, merchantId, environment);
  await ensureInvoiceEditable(invoice);

  if (input.title !== undefined) {
    invoice.title = input.title;
  }

  if (input.customerName !== undefined) {
    invoice.customerName = input.customerName;
  }

  if (input.customerEmail !== undefined) {
    invoice.customerEmail = input.customerEmail;
  }

  if (input.billingCurrency !== undefined) {
    const merchant = await ensureMerchantSupportsInvoice({
      merchantId: invoice.merchantId.toString(),
      environment: toStoredRuntimeMode(invoice.environment),
      billingCurrency: input.billingCurrency,
    });
    invoice.billingCurrency = input.billingCurrency;

    if (!merchant.supportedMarkets.includes(input.billingCurrency)) {
      throw new HttpError(
        409,
        `Currency ${input.billingCurrency} is not enabled for this merchant.`
      );
    }
  }

  if (input.dueDate !== undefined) {
    invoice.dueDate = input.dueDate;
  }

  if (input.note !== undefined) {
    invoice.note = input.note ?? null;
  }

  if (input.lineItems !== undefined) {
    const lineItems = normalizeInvoiceLineItems(input.lineItems);
    invoice.set("lineItems", lineItems);
    invoice.usdAmount = sumInvoiceUsdAmount(lineItems);
  }

  if (input.metadata !== undefined) {
    invoice.metadata = {
      ...(invoice.metadata ?? {}),
      ...input.metadata,
    };
  }

  if (input.status === "void") {
    invoice.status = "void";
    invoice.voidedAt = invoice.voidedAt ?? new Date();
  } else if (input.status === "issued") {
    invoice.status = "issued";
    invoice.issuedAt = invoice.issuedAt ?? new Date();
  } else if (input.status === "draft") {
    invoice.status = "draft";
  }

  if (
    input.billingCurrency !== undefined ||
    input.lineItems !== undefined
  ) {
    const quote = await quoteUsdAmountInBillingCurrency({
      environment: toStoredRuntimeMode(invoice.environment),
      currency: invoice.billingCurrency,
      usdAmount: invoice.usdAmount,
    });
    invoice.localAmount = quote.localAmount;
    invoice.fxRate = quote.fxRate;
    invoice.usdcAmount = quote.usdcAmount;
    invoice.feeAmount = quote.feeAmount;
  }

  if (
    input.customerName !== undefined ||
    input.customerEmail !== undefined ||
    input.billingCurrency !== undefined
  ) {
    const customer = await upsertInvoiceCustomer({
      merchantId: invoice.merchantId.toString(),
      environment: toStoredRuntimeMode(invoice.environment),
      customerName: invoice.customerName,
      customerEmail: invoice.customerEmail,
      billingCurrency: invoice.billingCurrency,
    });
    invoice.customerId = customer._id;
  }

  await invoice.save();

  if (input.status === "issued" && !invoice.sentAt) {
    await queueInvoiceIssuedNotification({
      invoiceId: invoice._id.toString(),
      environment: toStoredRuntimeMode(invoice.environment),
    }).catch(() => undefined);
    invoice.sentAt = new Date();
    await invoice.save();
  }

  return getInvoiceById(
    invoice._id.toString(),
    invoice.merchantId.toString(),
    toStoredRuntimeMode(invoice.environment)
  );
}

export async function sendInvoice(
  invoiceId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const invoice = await ensureInvoiceScope(invoiceId, merchantId, environment);

  if (invoice.status === "paid") {
    throw new HttpError(409, "Paid invoices cannot be resent.");
  }

  if (invoice.status === "void") {
    throw new HttpError(409, "Voided invoices cannot be sent.");
  }

  invoice.status = invoice.status === "draft" ? "issued" : invoice.status;
  invoice.issuedAt = invoice.issuedAt ?? new Date();
  invoice.sentAt = new Date();
  await invoice.save();

  await queueInvoiceIssuedNotification({
    invoiceId: invoice._id.toString(),
    environment: toStoredRuntimeMode(invoice.environment),
  }).catch(() => undefined);

  return getInvoiceById(
    invoice._id.toString(),
    invoice.merchantId.toString(),
    toStoredRuntimeMode(invoice.environment)
  );
}

export async function remindInvoice(
  invoiceId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const invoice = await ensureInvoiceScope(invoiceId, merchantId, environment);

  if (invoice.status === "draft" || invoice.status === "paid" || invoice.status === "void") {
    throw new HttpError(409, "This invoice cannot be reminded.");
  }

  invoice.lastRemindedAt = new Date();
  await invoice.save();

  await queueInvoiceReminderNotification({
    invoiceId: invoice._id.toString(),
    environment: toStoredRuntimeMode(invoice.environment),
  }).catch(() => undefined);

  return getInvoiceById(
    invoice._id.toString(),
    invoice.merchantId.toString(),
    toStoredRuntimeMode(invoice.environment)
  );
}

export async function voidInvoice(
  invoiceId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const invoice = await ensureInvoiceScope(invoiceId, merchantId, environment);

  if (invoice.status === "paid") {
    throw new HttpError(409, "Paid invoices cannot be voided.");
  }

  invoice.status = "void";
  invoice.voidedAt = new Date();
  await invoice.save();

  return getInvoiceById(
    invoice._id.toString(),
    invoice.merchantId.toString(),
    toStoredRuntimeMode(invoice.environment)
  );
}

export async function getPublicInvoiceByToken(publicToken: string) {
  const scoped = await ensurePublicInvoice(publicToken);
  const synced = await syncInvoiceDocument(scoped._id.toString());

  return toPublicInvoiceResponse({
    invoice: synced.invoice,
    charge: synced.charge,
    settlement: synced.settlement,
  });
}

export async function startPublicInvoicePayment(publicToken: string) {
  const invoice = await ensurePublicInvoice(publicToken);

  if (invoice.status === "draft") {
    throw new HttpError(409, "Invoice is not active yet.");
  }

  if (invoice.status === "void") {
    throw new HttpError(409, "Invoice is no longer payable.");
  }

  if (invoice.status === "paid") {
    return getPublicInvoiceByToken(publicToken);
  }

  return createInvoicePaymentAttempt(invoice);
}

export async function submitPublicInvoiceVerification(
  publicToken: string,
  input: SubmitInvoiceVerificationInput
) {
  const invoice = await ensurePublicInvoice(publicToken);

  if (invoice.status === "draft") {
    throw new HttpError(409, "Invoice is not active yet.");
  }

  if (invoice.status === "void") {
    throw new HttpError(409, "Invoice is no longer payable.");
  }

  if (!invoice.customerId) {
    throw new HttpError(409, "Invoice customer is not ready.");
  }

  if (input.bvn?.trim()) {
    invoice.verificationSnapshot = {
      provider: "partna",
      status: "processing",
      country: "NG",
      currency: invoice.billingCurrency,
      instructions: "Starting verification for this invoice.",
      accountName: null,
      verificationMethod: null,
      requiredFields: [],
    };
    await invoice.save();

    const pendingVerification = await startPartnaCustomerPaymentProfileVerification({
      customerId: invoice.customerId.toString(),
      environment: toStoredRuntimeMode(invoice.environment),
      verification: {
        bvn: input.bvn,
      },
    });

    invoice.verificationSnapshot = buildPartnaOtpVerificationSnapshot({
      currency: invoice.billingCurrency,
      accountName: pendingVerification.accountName ?? "",
      verificationMethod: pendingVerification.verificationMethod ?? "email",
      verificationHint: pendingVerification.verificationHint,
    });
    await invoice.save();

    return getPublicInvoiceByToken(publicToken);
  }

  if (!input.otp?.trim()) {
    throw new HttpError(409, "Verification code is required.");
  }

  invoice.verificationSnapshot = {
    provider: "partna",
    status: "processing",
    country: "NG",
    currency: invoice.billingCurrency,
    instructions: "Finishing verification and preparing payment details.",
    accountName: invoice.verificationSnapshot?.accountName ?? null,
    verificationMethod: invoice.verificationSnapshot?.verificationMethod ?? null,
    requiredFields: [],
  };
  await invoice.save();

  await completePartnaCustomerPaymentProfileVerification({
    customerId: invoice.customerId.toString(),
    environment: toStoredRuntimeMode(invoice.environment),
    verification: {
      otp: input.otp,
    },
    accountName: invoice.verificationSnapshot?.accountName ?? undefined,
  });

  return createInvoicePaymentAttempt(invoice);
}

export async function completePublicInvoiceTestPayment(publicToken: string) {
  const invoice = await ensurePublicInvoice(publicToken);
  const runtimeEnvironment = toStoredRuntimeMode(invoice.environment);

  if (runtimeEnvironment !== "test") {
    throw new HttpError(
      409,
      "Test payment completion is only available in sandbox mode."
    );
  }

  if (invoice.paymentProvider !== "partna") {
    throw new HttpError(
      409,
      "Sandbox payment completion is only implemented for Partna invoices."
    );
  }

  const accountNumber = invoice.paymentSnapshot?.bankTransfer?.accountNumber;

  if (!accountNumber || !invoice.paymentSnapshot?.externalChargeId) {
    throw new HttpError(409, "Invoice has no pending payment instructions.");
  }

  const provider = getPartnaProvider("test");

  if (!provider.makeMockPayment) {
    throw new HttpError(500, "Partna sandbox mock payments are unavailable.");
  }

  const mockResult = await provider.makeMockPayment({
    accountNumber,
    paymentAmount: invoice.paymentSnapshot.localAmount ?? invoice.localAmount,
    currency: invoice.paymentSnapshot.billingCurrency ?? invoice.billingCurrency,
    reference:
      invoice.paymentSnapshot.reference ?? invoice.paymentSnapshot.externalChargeId,
  });

  await processPartnaWebhook(
    {
      event: "voucher.updated",
      data: {
        id: invoice.paymentSnapshot.externalChargeId,
        voucherCode: toNullableString((mockResult as Record<string, unknown>).voucherCode),
        email: invoice.customerEmail,
        fullName: invoice.customerName,
        amount: invoice.paymentSnapshot.localAmount ?? invoice.localAmount,
        currency: invoice.paymentSnapshot.billingCurrency ?? invoice.billingCurrency,
        fee: 0,
        status: "success",
      },
    },
    "test"
  );

  return getPublicInvoiceByToken(publicToken);
}
