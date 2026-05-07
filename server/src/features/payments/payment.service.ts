import { randomBytes } from "crypto";
import { Types, type HydratedDocument } from "mongoose";

import { env } from "@/config/env.config";
import { emitPaymentWebhookEventForStatusChange } from "@/features/developers/developer-webhook-delivery.service";
import { CustomerModel, type CustomerDocument } from "@/features/customers/customer.model";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { quoteLocalAmountInSettlementAsset } from "@/features/onramps/onramp.service";
import {
  completePartnaCustomerPaymentProfileVerification,
  continuePartnaCustomerPaymentProfileVerificationAfterMethod,
  continuePartnaCustomerPaymentProfileVerificationAfterPhone,
  hasActivePartnaPaymentProfile,
  startPartnaCustomerPaymentProfileVerification,
} from "@/features/onramps/partna.service";
import { getPartnaProvider } from "@/features/onramps/providers/partna/partna.factory";
import { PaymentModel, type PaymentRecord } from "@/features/payments/payment.model";
import type {
  ConfirmPublicCheckoutOtpInput,
  ConfirmPublicCheckoutPhoneInput,
  CreateCollectionInput,
  CreatePaymentInput,
  ListCollectionsQuery,
  ListPaymentsQuery,
  SelectPublicCheckoutKycMethodInput,
  StartPublicCheckoutKycInput,
  StartPublicPaymentInput,
  SubmitPublicCheckoutCustomerInput,
  UpdatePaymentInput,
} from "@/features/payments/payment.validation";
import { SettingModel } from "@/features/settings/setting.model";
import { SettlementRouteModel } from "@/features/settlement/settlement-route.model";
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

function buildPaymentUrl(payId: string) {
  return new URL(`/pay/${payId}`, env.APP_BASE_URL).toString();
}

function createPayId() {
  return `pay_${randomBytes(12).toString("hex")}`;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

type CustomerRecord = HydratedDocument<CustomerDocument>;

type PublicCheckoutState =
  | "needs_customer"
  | "ready_to_pay"
  | "needs_bvn"
  | "needs_verification_method"
  | "needs_phone"
  | "needs_otp"
  | "show_bank_transfer"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled";

type PublicCheckoutCustomerInput = {
  reference?: string | null;
  email?: string | null;
  name?: string | null;
  payerEmail?: string | null;
  payerName?: string | null;
  customer?: {
    reference?: string | null;
    email?: string | null;
    name?: string | null;
  } | null;
};

function toPaymentResponse(document: PaymentRecord) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    environment: document.environment,
    payId: document.payId,
    customerId: document.customerId?.toString() ?? null,
    settlementRouteId: document.settlementRouteId?.toString() ?? null,
    amount: document.amount,
    currency: document.currency,
    description: document.description,
    status: document.status,
    paymentUrl: document.paymentUrl,
    recurring: {
      enabled: document.recurring.enabled,
      interval: document.recurring.interval ?? null,
      intervalCount: document.recurring.intervalCount ?? null,
      startsAt: document.recurring.startsAt ?? null,
      endsAt: document.recurring.endsAt ?? null,
    },
    collection: {
      provider: document.collection.provider,
      status: document.collection.status,
      externalId: document.collection.externalId ?? null,
      localAmount: document.collection.localAmount ?? null,
      fxRate: document.collection.fxRate ?? null,
      stableAmount: document.collection.stableAmount ?? null,
      feeAmount: document.collection.feeAmount ?? null,
      paidAt: document.collection.paidAt ?? null,
    },
    metadata: document.metadata ?? {},
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

type PaymentResponse = ReturnType<typeof toPaymentResponse>;

const objectIdPattern = /^[a-fA-F0-9]{24}$/;

function mapCollectionStatus(status: PaymentResponse["status"]) {
  if (status === "open") {
    return "created";
  }

  if (status === "pending") {
    return "collecting";
  }

  if (status === "failed" || status === "cancelled") {
    return status;
  }

  return "paid";
}

function toCollectionResponse(payment: PaymentResponse) {
  const metadata = asRecord(payment.metadata);
  const customer = asRecord(metadata.customer);

  return {
    id: payment.payId,
    paymentId: payment.id,
    reference: readString(metadata.reference) ?? payment.payId,
    amount: payment.amount,
    currency: payment.currency,
    description: payment.description,
    status: mapCollectionStatus(payment.status),
    checkoutUrl: payment.paymentUrl,
    recurring: payment.recurring,
    settlement: payment.settlementRouteId
      ? {
          id: payment.settlementRouteId,
        }
      : null,
    customer: Object.keys(customer).length > 0
      ? {
          reference: readString(customer.reference),
          email: readString(customer.email),
          name: readString(customer.name),
        }
      : null,
    metadata,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

function getPaymentRuntimeMode(payment: { environment: string }) {
  return payment.environment === "live" ? "live" : "test";
}

function readPublicCheckoutCustomerDetails(
  payment: Pick<PaymentRecord, "metadata" | "payId">,
  input?: PublicCheckoutCustomerInput,
  customer?: CustomerRecord | null
) {
  const metadata = asRecord(payment.metadata);
  const metadataCustomer = asRecord(metadata.customer);
  const email =
    readString(input?.customer?.email) ??
    readString(input?.email) ??
    readString(input?.payerEmail) ??
    readString(customer?.email) ??
    readString(metadataCustomer.email) ??
    readString(metadata.payerEmail) ??
    readString(metadata.email);
  const name =
    readString(input?.customer?.name) ??
    readString(input?.name) ??
    readString(input?.payerName) ??
    readString(customer?.name) ??
    readString(metadataCustomer.name) ??
    readString(metadata.payerName);
  const reference =
    readString(input?.customer?.reference) ??
    readString(input?.reference) ??
    readString(customer?.customerRef) ??
    readString(metadataCustomer.reference);

  return {
    reference,
    email: email?.toLowerCase() ?? null,
    name,
  };
}

async function findPublicCheckoutCustomer(
  payment: PaymentRecord,
  input?: PublicCheckoutCustomerInput
) {
  const environment = getPaymentRuntimeMode(payment);
  const scope = {
    merchantId: payment.merchantId,
    ...createRuntimeModeCondition("environment", environment),
  };
  const details = readPublicCheckoutCustomerDetails(payment, input);

  if (payment.customerId) {
    const customer = await CustomerModel.findOne({
      ...scope,
      _id: payment.customerId,
    }).exec();

    if (customer) {
      return customer;
    }
  }

  if (details.email) {
    const customer = await CustomerModel.findOne({
      ...scope,
      email: details.email,
    }).exec();

    if (customer) {
      return customer;
    }
  }

  if (details.reference) {
    const customer = await CustomerModel.findOne({
      ...scope,
      customerRef: details.reference,
    }).exec();

    if (customer) {
      return customer;
    }
  }

  return null;
}

async function syncPaymentCheckoutCustomer(input: {
  payment: PaymentRecord;
  customer: CustomerRecord;
  reference?: string | null;
}) {
  const metadata = asRecord(input.payment.metadata);
  const metadataCustomer = asRecord(metadata.customer);

  input.payment.customerId = input.customer._id;
  input.payment.metadata = {
    ...metadata,
    email: input.customer.email,
    payerEmail: input.customer.email,
    payerName: input.customer.name,
    customer: {
      ...metadataCustomer,
      reference: input.reference ?? input.customer.customerRef,
      email: input.customer.email,
      name: input.customer.name,
    },
  };
  await input.payment.save();
}

async function ensurePublicCheckoutCustomer(
  payment: PaymentRecord,
  input?: PublicCheckoutCustomerInput
) {
  const existingCustomer = await findPublicCheckoutCustomer(payment, input);
  const details = readPublicCheckoutCustomerDetails(payment, input, existingCustomer);

  if (!details.email || !details.name) {
    return null;
  }

  const environment = getPaymentRuntimeMode(payment);
  const customerRef = (details.reference ?? details.email ?? payment.payId).slice(0, 160);
  const metadata = {
    source: "checkout",
    payId: payment.payId,
  };
  const customer =
    existingCustomer ??
    (await CustomerModel.create({
      merchantId: payment.merchantId,
      environment,
      customerRef,
      name: details.name,
      email: details.email,
      market: payment.currency,
      status: "active",
      monthlyVolumeUsdc: 0,
      metadata,
    }));

  if (customer.blacklistedAt || customer.status === "blacklisted") {
    throw new HttpError(403, "This customer cannot complete checkout.");
  }

  let shouldSaveCustomer = false;

  if (customer.name !== details.name) {
    customer.name = details.name;
    shouldSaveCustomer = true;
  }

  if (customer.email !== details.email) {
    customer.email = details.email;
    shouldSaveCustomer = true;
  }

  if (customer.market !== payment.currency) {
    customer.market = payment.currency;
    shouldSaveCustomer = true;
  }

  if (shouldSaveCustomer) {
    await customer.save();
  }

  await syncPaymentCheckoutCustomer({
    payment,
    customer,
    reference: details.reference ?? customerRef,
  });

  return customer;
}

function readPublicCheckoutVerificationMethods(customer: CustomerRecord | null) {
  const raw = asRecord(customer?.paymentProfile?.partna?.raw);
  const methods = Array.isArray(raw.verificationMethods)
    ? raw.verificationMethods
    : [];

  return methods
    .map((entry) => asRecord(entry))
    .map((entry) => ({
      method: readString(entry.method) ?? "",
      hint: readString(entry.hint),
    }))
    .filter((entry) => entry.method.length > 0);
}

function resolvePublicCheckoutState(
  payment: PaymentRecord,
  customer: CustomerRecord | null
): PublicCheckoutState {
  if (["paid", "settling", "settled"].includes(payment.status)) {
    return "paid";
  }

  if (payment.status === "failed") {
    return "failed";
  }

  if (payment.status === "cancelled") {
    return "cancelled";
  }

  const details = readPublicCheckoutCustomerDetails(payment, undefined, customer);

  if (!details.email || !details.name) {
    return "needs_customer";
  }

  if (!customer) {
    return "ready_to_pay";
  }

  if (!hasActivePartnaPaymentProfile(customer, payment.currency)) {
    const kycStatus = readString(
      asRecord(customer.paymentProfile?.partna?.raw).kycStatus
    );

    if (kycStatus === "method_required") {
      return "needs_verification_method";
    }

    if (kycStatus === "phone_confirmation_required") {
      return "needs_phone";
    }

    if (kycStatus === "otp_pending") {
      return "needs_otp";
    }

    return "needs_bvn";
  }

  if (payment.collection.externalId) {
    return "show_bank_transfer";
  }

  return payment.status === "pending" ? "processing" : "ready_to_pay";
}

async function toPublicPaymentResponse(document: PaymentRecord) {
  const [merchant, setting, customerDocument] = await Promise.all([
    MerchantModel.findById(document.merchantId)
      .select({ name: 1, supportEmail: 1 })
      .lean()
      .exec(),
    SettingModel.findOne({ merchantId: document.merchantId })
      .select({ business: 1 })
      .lean()
      .exec(),
    findPublicCheckoutCustomer(document),
  ]);
  const metadata = asRecord(document.metadata);
  const customerDetails = readPublicCheckoutCustomerDetails(
    document,
    undefined,
    customerDocument
  );
  const reference = readString(metadata.reference);
  const description =
    reference && document.description.trim() === reference
      ? null
      : document.description;
  const checkoutState = resolvePublicCheckoutState(document, customerDocument);
  const partnaRaw = asRecord(customerDocument?.paymentProfile?.partna?.raw);
  const bankTransfer = customerDocument?.paymentProfile?.bankTransfer ?? null;

  return {
    payId: document.payId,
    amount: document.amount,
    currency: document.currency,
    description,
    status: document.status,
    paymentUrl: document.paymentUrl,
    merchant: {
      name:
        setting?.business?.name ??
        merchant?.name ??
        "Renew merchant",
      supportEmail:
        setting?.business?.supportEmail ??
        merchant?.supportEmail ??
        null,
      logoUrl: setting?.business?.logoUrl ?? null,
    },
    recurring: {
      enabled: document.recurring.enabled,
      interval: document.recurring.interval ?? null,
      intervalCount: document.recurring.intervalCount ?? null,
    },
    customer: {
      reference: customerDetails.reference,
      email: customerDetails.email,
      name: customerDetails.name,
    },
    checkout: {
      state: checkoutState,
      verification: {
        methods: readPublicCheckoutVerificationMethods(customerDocument),
        selectedMethod: readString(partnaRaw.selectedVerificationMethod),
        selectedHint: readString(partnaRaw.selectedVerificationHint),
        phoneConfirmationRequired: checkoutState === "needs_phone",
        message: readString(partnaRaw.otpDispatchMessage),
        bvnLast4: readString(customerDocument?.paymentProfile?.partna?.bvnLast4),
      },
      bankTransfer: bankTransfer
        ? {
            bankCode: bankTransfer.bankCode ?? null,
            bankName: bankTransfer.bankName ?? null,
            accountName: bankTransfer.accountName ?? null,
            accountNumber: bankTransfer.accountNumber ?? null,
            currency: bankTransfer.currency ?? document.currency,
          }
        : null,
    },
    collection: {
      provider: document.collection.provider,
      status: document.collection.status,
      localAmount: document.collection.localAmount ?? document.amount,
      stableAmount: document.collection.stableAmount ?? null,
      feeAmount: document.collection.feeAmount ?? null,
      paidAt: document.collection.paidAt ?? null,
      paymentUrl: null,
    },
  };
}

async function ensureMerchant(merchantId: string) {
  const merchant = await MerchantModel.exists({ _id: merchantId });

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }
}

async function ensureCustomerScope(input: {
  customerId?: string | null;
  merchantId: string;
  environment: RuntimeMode;
}) {
  if (!input.customerId) {
    return;
  }

  const customer = await CustomerModel.exists({
    _id: input.customerId,
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
  });

  if (!customer) {
    throw new HttpError(404, "Customer was not found.");
  }
}

async function ensureSettlementRouteScope(input: {
  settlementRouteId?: string | null;
  merchantId: string;
  environment: RuntimeMode;
}) {
  if (!input.settlementRouteId) {
    return;
  }

  const route = await SettlementRouteModel.exists({
    _id: input.settlementRouteId,
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
  });

  if (!route) {
    throw new HttpError(404, "Settlement route was not found.");
  }
}

async function resolvePaymentSettlementRouteId(input: {
  settlementRouteId?: string | null;
  merchantId: string;
  environment: RuntimeMode;
}) {
  if (input.settlementRouteId) {
    await ensureSettlementRouteScope(input);
    return new Types.ObjectId(input.settlementRouteId);
  }

  const defaultRoute = await SettlementRouteModel.findOne({
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
    isDefault: true,
    status: "active",
  })
    .select({ _id: 1 })
    .exec();

  if (!defaultRoute) {
    throw new HttpError(
      409,
      "Create an active default settlement route before creating payments."
    );
  }

  return defaultRoute._id;
}

async function resolveCollectionSettlementRouteId(input: {
  settlement?: string;
  merchantId: string;
  environment: RuntimeMode;
}) {
  const settlement = input.settlement?.trim();

  if (!settlement || settlement === "default") {
    return null;
  }

  if (objectIdPattern.test(settlement)) {
    return settlement;
  }

  const normalized = settlement.toLowerCase();
  const route = await SettlementRouteModel.findOne({
    merchantId: input.merchantId,
    ...createRuntimeModeCondition("environment", input.environment),
    status: "active",
    $or: [
      { routeCode: normalized },
      ...(normalized === "standard" || normalized === "private"
        ? [{ mode: normalized }]
        : []),
    ],
  })
    .sort({ isDefault: -1, createdAt: 1 })
    .select({ _id: 1 })
    .exec();

  if (!route) {
    throw new HttpError(404, "Settlement was not found.");
  }

  return route._id.toString();
}

async function ensurePaymentScope(
  paymentId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const filters: Record<string, unknown>[] = [
    /^[a-fA-F0-9]{24}$/.test(paymentId)
      ? { _id: paymentId }
      : { payId: paymentId },
  ];

  if (merchantId) {
    filters.push({ merchantId });
  }

  if (environment) {
    filters.push(createRuntimeModeCondition("environment", environment));
  }

  const payment = await PaymentModel.findOne({ $and: filters }).exec();

  if (!payment) {
    throw new HttpError(404, "Payment was not found.");
  }

  return payment;
}

export async function createPayment(input: CreatePaymentInput) {
  await ensureMerchant(input.merchantId);
  const [, settlementRouteId] = await Promise.all([
    ensureCustomerScope({
      customerId: input.customerId,
      merchantId: input.merchantId,
      environment: input.environment,
    }),
    resolvePaymentSettlementRouteId({
      settlementRouteId: input.settlementRouteId,
      merchantId: input.merchantId,
      environment: input.environment,
    }),
  ]);

  const payId = createPayId();
  const payment = await PaymentModel.create({
    merchantId: input.merchantId,
    environment: input.environment,
    payId,
    customerId: input.customerId ?? null,
    settlementRouteId,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    status: "open",
    paymentUrl: buildPaymentUrl(payId),
    recurring: {
      enabled: input.recurring.enabled,
      interval: input.recurring.interval ?? null,
      intervalCount: input.recurring.intervalCount ?? null,
      startsAt: input.recurring.startsAt ?? null,
      endsAt: input.recurring.endsAt ?? null,
    },
    collection: {
      provider: "partna",
      status: "not_started",
    },
    metadata: input.metadata ?? {},
  });

  return toPaymentResponse(payment);
}

export async function createCollection(input: CreateCollectionInput) {
  const settlementRouteId = await resolveCollectionSettlementRouteId({
    settlement: input.settlement,
    merchantId: input.merchantId,
    environment: input.environment,
  });
  const metadata = {
    ...(input.metadata ?? {}),
    reference: input.reference,
    ...(input.customer ? { customer: input.customer } : {}),
  };
  const payment = await createPayment({
    merchantId: input.merchantId,
    environment: input.environment,
    settlementRouteId,
    amount: input.amount,
    currency: input.currency,
    description: input.description ?? input.reference,
    recurring: input.recurring,
    metadata,
  });

  return toCollectionResponse(payment);
}

export async function listPayments(query: ListPaymentsQuery) {
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

  if (query.customerId) {
    filters.push({ customerId: query.customerId });
  }

  if (query.recurring !== undefined) {
    filters.push({ "recurring.enabled": query.recurring });
  }

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "i");
    filters.push({
      $or: [
        { payId: pattern },
        { description: pattern },
        { currency: pattern },
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
    const payments = await PaymentModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .exec();

    return {
      items: payments.map(toPaymentResponse),
    } satisfies ListResult<ReturnType<typeof toPaymentResponse>>;
  }

  const [total, payments] = await Promise.all([
    PaymentModel.countDocuments(mongoQuery).exec(),
    PaymentModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: payments.map(toPaymentResponse),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toPaymentResponse>>;
}

function buildSearchFilter(search: string) {
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, "i");

  return {
    $or: [
      { payId: pattern },
      { description: pattern },
      { currency: pattern },
      { "metadata.reference": pattern },
    ],
  };
}

export async function listCollections(query: ListCollectionsQuery) {
  const filters: Record<string, unknown>[] = [];

  if (query.merchantId) {
    filters.push({ merchantId: query.merchantId });
  }

  if (query.environment) {
    filters.push(createRuntimeModeCondition("environment", query.environment));
  }

  if (query.status) {
    if (query.status === "paid") {
      filters.push({ status: { $in: ["paid", "settling", "settled"] } });
    } else {
      filters.push({
        status:
          query.status === "created"
            ? "open"
            : query.status === "collecting"
              ? "pending"
              : query.status,
      });
    }
  }

  if (query.customerId) {
    filters.push({ customerId: query.customerId });
  }

  if (query.recurring !== undefined) {
    filters.push({ "recurring.enabled": query.recurring });
  }

  if (query.search) {
    filters.push(buildSearchFilter(query.search));
  }

  const mongoQuery =
    filters.length === 0
      ? {}
      : filters.length === 1
        ? filters[0]
        : { $and: filters };
  const pagination = resolvePagination(query);

  if (!pagination) {
    const payments = await PaymentModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .exec();

    return {
      items: payments.map((payment) => toCollectionResponse(toPaymentResponse(payment))),
    } satisfies ListResult<ReturnType<typeof toCollectionResponse>>;
  }

  const [total, payments] = await Promise.all([
    PaymentModel.countDocuments(mongoQuery).exec(),
    PaymentModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: payments.map((payment) => toCollectionResponse(toPaymentResponse(payment))),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toCollectionResponse>>;
}

export async function getPaymentById(
  paymentId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const payment = await ensurePaymentScope(paymentId, merchantId, environment);

  return toPaymentResponse(payment);
}

export async function getCollectionById(
  collectionId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const payment = await getPaymentById(collectionId, merchantId, environment);

  return toCollectionResponse(payment);
}

export async function cancelCollection(
  collectionId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const payment = await ensurePaymentScope(collectionId, merchantId, environment);

  if (["paid", "settling", "settled"].includes(payment.status)) {
    throw new HttpError(409, "A paid collection cannot be cancelled.");
  }

  payment.status = "cancelled";
  payment.collection.status = "cancelled";
  await payment.save();

  return toCollectionResponse(toPaymentResponse(payment));
}

export async function getPublicPayment(payId: string) {
  const payment = await PaymentModel.findOne({ payId }).exec();

  if (!payment) {
    throw new HttpError(404, "Payment was not found.");
  }

  return toPublicPaymentResponse(payment);
}

async function ensurePublicPaymentScope(payId: string) {
  const payment = await PaymentModel.findOne({ payId }).exec();

  if (!payment) {
    throw new HttpError(404, "Payment was not found.");
  }

  return payment;
}

function checkoutIsComplete(payment: PaymentRecord) {
  return ["paid", "settling", "settled", "cancelled", "failed"].includes(
    payment.status
  );
}

async function ensureCheckoutCustomerOrThrow(
  payment: PaymentRecord,
  input?: PublicCheckoutCustomerInput
) {
  const customer = await ensurePublicCheckoutCustomer(payment, input);

  if (!customer) {
    throw new HttpError(409, "Enter customer details before checkout.");
  }

  return customer;
}

async function ensurePartnaVoucherForPayment(
  payment: PaymentRecord,
  customer: CustomerRecord
) {
  if (payment.collection.externalId) {
    return;
  }

  if (!hasActivePartnaPaymentProfile(customer, payment.currency)) {
    return;
  }

  const merchant = await MerchantModel.findById(payment.merchantId)
    .select({ name: 1 })
    .lean()
    .exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  const environment = getPaymentRuntimeMode(payment);
  const quote = await quoteLocalAmountInSettlementAsset({
    environment,
    currency: payment.currency,
    localAmount: payment.amount,
  });
  const voucher = await getPartnaProvider(environment).createVoucher({
    email: customer.email,
    fullName: customer.name,
    amount: payment.amount,
    currency: payment.currency,
    merchant: merchant.name ?? "Renew merchant",
  });
  const previousStatus = payment.status;
  const metadata = asRecord(payment.metadata);

  payment.status = voucher.status === "success" ? "paid" : "pending";
  payment.collection.provider = "partna";
  payment.collection.status = voucher.status === "success" ? "paid" : "pending";
  payment.collection.externalId = voucher.voucherId;
  payment.collection.localAmount = quote.localAmount;
  payment.collection.fxRate = quote.fxRate;
  payment.collection.stableAmount = quote.usdcAmount;
  payment.collection.feeAmount = quote.feeAmount;
  payment.collection.paidAt =
    payment.collection.status === "paid" ? payment.collection.paidAt ?? new Date() : null;
  payment.metadata = {
    ...metadata,
    email: customer.email,
    payerEmail: customer.email,
    payerName: customer.name,
    voucherCode: voucher.voucherCode,
    voucherStatus: voucher.status,
    channelId: quote.channel.externalId,
    networkId: quote.network.externalId,
  };
  await payment.save();

  await emitPaymentWebhookEventForStatusChange({
    previousStatus,
    paymentId: payment._id.toString(),
    nextStatus: payment.status,
  }).catch(() => undefined);
}

export async function submitPublicCheckoutCustomer(
  payId: string,
  input: SubmitPublicCheckoutCustomerInput
) {
  const payment = await ensurePublicPaymentScope(payId);

  if (["paid", "settling", "settled", "cancelled"].includes(payment.status)) {
    return toPublicPaymentResponse(payment);
  }

  await ensurePublicCheckoutCustomer(payment, input);

  return toPublicPaymentResponse(payment);
}

export async function startPublicCheckoutKyc(
  payId: string,
  input: StartPublicCheckoutKycInput
) {
  const payment = await ensurePublicPaymentScope(payId);

  if (checkoutIsComplete(payment)) {
    return toPublicPaymentResponse(payment);
  }

  const customer = await ensureCheckoutCustomerOrThrow(payment);

  await startPartnaCustomerPaymentProfileVerification({
    customerId: customer._id.toString(),
    environment: getPaymentRuntimeMode(payment),
    verification: {
      bvn: input.bvn,
      kesMobileNetwork: input.kesMobileNetwork,
      kesShortcode: input.kesShortcode,
    },
  });

  return toPublicPaymentResponse(payment);
}

export async function selectPublicCheckoutKycMethod(
  payId: string,
  input: SelectPublicCheckoutKycMethodInput
) {
  const payment = await ensurePublicPaymentScope(payId);

  if (checkoutIsComplete(payment)) {
    return toPublicPaymentResponse(payment);
  }

  const customer = await ensureCheckoutCustomerOrThrow(payment);

  await continuePartnaCustomerPaymentProfileVerificationAfterMethod({
    customerId: customer._id.toString(),
    environment: getPaymentRuntimeMode(payment),
    verification: {
      verificationMethod: input.verificationMethod,
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
    },
  });

  return toPublicPaymentResponse(payment);
}

export async function confirmPublicCheckoutPhone(
  payId: string,
  input: ConfirmPublicCheckoutPhoneInput
) {
  const payment = await ensurePublicPaymentScope(payId);

  if (checkoutIsComplete(payment)) {
    return toPublicPaymentResponse(payment);
  }

  const customer = await ensureCheckoutCustomerOrThrow(payment);

  await continuePartnaCustomerPaymentProfileVerificationAfterPhone({
    customerId: customer._id.toString(),
    environment: getPaymentRuntimeMode(payment),
    verification: {
      phone: input.phone,
    },
  });

  return toPublicPaymentResponse(payment);
}

export async function confirmPublicCheckoutOtp(
  payId: string,
  input: ConfirmPublicCheckoutOtpInput
) {
  const payment = await ensurePublicPaymentScope(payId);

  if (checkoutIsComplete(payment)) {
    return toPublicPaymentResponse(payment);
  }

  const customer = await ensureCheckoutCustomerOrThrow(payment);

  await completePartnaCustomerPaymentProfileVerification({
    customerId: customer._id.toString(),
    environment: getPaymentRuntimeMode(payment),
    verification: {
      otp: input.otp,
    },
  });

  const verifiedCustomer = await ensureCheckoutCustomerOrThrow(payment);
  await ensurePartnaVoucherForPayment(payment, verifiedCustomer);

  return toPublicPaymentResponse(payment);
}

export async function startPublicPayment(
  payId: string,
  input: StartPublicPaymentInput
) {
  const payment = await ensurePublicPaymentScope(payId);

  if (checkoutIsComplete(payment)) {
    return toPublicPaymentResponse(payment);
  }

  const customer = await ensurePublicCheckoutCustomer(payment, input);

  if (customer) {
    await ensurePartnaVoucherForPayment(payment, customer);
  }

  return toPublicPaymentResponse(payment);
}

export async function updatePayment(
  paymentId: string,
  input: UpdatePaymentInput,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const payment = await ensurePaymentScope(paymentId, merchantId, environment);
  const paymentEnvironment = payment.environment === "live" ? "live" : "test";
  const scopedMerchantId = payment.merchantId.toString();

  await Promise.all([
    ensureCustomerScope({
      customerId: input.customerId,
      merchantId: scopedMerchantId,
      environment: paymentEnvironment,
    }),
    ensureSettlementRouteScope({
      settlementRouteId: input.settlementRouteId,
      merchantId: scopedMerchantId,
      environment: paymentEnvironment,
    }),
  ]);

  if (input.customerId !== undefined) {
    payment.customerId = input.customerId ? new Types.ObjectId(input.customerId) : null;
  }

  if (input.settlementRouteId !== undefined) {
    payment.settlementRouteId = input.settlementRouteId
      ? new Types.ObjectId(input.settlementRouteId)
      : null;
  }

  if (input.amount !== undefined) {
    payment.amount = input.amount;
  }

  if (input.currency !== undefined) {
    payment.currency = input.currency;
  }

  if (input.description !== undefined) {
    payment.description = input.description;
  }

  if (input.status !== undefined) {
    payment.status = input.status;
  }

  if (input.recurring !== undefined) {
    payment.recurring = {
      enabled: input.recurring.enabled,
      interval: input.recurring.interval ?? null,
      intervalCount: input.recurring.intervalCount ?? null,
      startsAt: input.recurring.startsAt ?? null,
      endsAt: input.recurring.endsAt ?? null,
    };
  }

  if (input.metadata !== undefined) {
    payment.metadata = input.metadata;
  }

  await payment.save();

  return toPaymentResponse(payment);
}
