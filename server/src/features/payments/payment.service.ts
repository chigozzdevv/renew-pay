import { randomBytes } from "crypto";
import { Types } from "mongoose";

import { env } from "@/config/env.config";
import { CustomerModel } from "@/features/customers/customer.model";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { PaymentModel, type PaymentRecord } from "@/features/payments/payment.model";
import type {
  CreatePaymentInput,
  ListPaymentsQuery,
  UpdatePaymentInput,
} from "@/features/payments/payment.validation";
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
  await Promise.all([
    ensureCustomerScope({
      customerId: input.customerId,
      merchantId: input.merchantId,
      environment: input.environment,
    }),
    ensureSettlementRouteScope({
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
    settlementRouteId: input.settlementRouteId ?? null,
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

export async function getPaymentById(
  paymentId: string,
  merchantId?: string,
  environment?: RuntimeMode
) {
  const payment = await ensurePaymentScope(paymentId, merchantId, environment);

  return toPaymentResponse(payment);
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
