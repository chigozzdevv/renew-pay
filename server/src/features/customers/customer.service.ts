import { HttpError } from "@/shared/errors/http-error";

import { appendAuditLog } from "@/features/audit/audit.service";
import { CustomerModel } from "@/features/customers/customer.model";
import { MerchantModel } from "@/features/merchants/merchant.model";
import type {
  BlacklistCustomerInput,
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "@/features/customers/customer.validation";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import {
  buildPagination,
  resolvePagination,
  type ListResult,
} from "@/shared/utils/pagination";
import { createRuntimeModeCondition } from "@/shared/utils/runtime-environment";

function toCustomerResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  customerRef: string;
  name: string;
  email: string;
  market: string;
  status: string;
  monthlyVolumeUsdc: number;
  blacklistedAt?: Date | null;
  blacklistReason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    customerRef: document.customerRef,
    name: document.name,
    email: document.email,
    market: document.market,
    status: document.status,
    monthlyVolumeUsdc: document.monthlyVolumeUsdc,
    blacklistedAt: document.blacklistedAt ?? null,
    blacklistReason: document.blacklistReason ?? null,
    metadata: document.metadata ?? {},
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function ensureMerchant(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

async function ensureCustomer(
  customerId: string,
  merchantId: string,
  environment: RuntimeMode
) {
  const mongoQuery: Record<string, unknown> = {
    _id: customerId,
    merchantId,
    ...createRuntimeModeCondition("environment", environment),
  };

  const customer = await CustomerModel.findOne(mongoQuery).exec();

  if (!customer) {
    throw new HttpError(404, "Customer was not found.");
  }

  return customer;
}

function buildCustomerSearchFilter(search: string) {
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, "i");

  return {
    $or: [{ name: pattern }, { email: pattern }, { customerRef: pattern }],
  };
}

async function getCustomerSummary(scopedQuery: Record<string, unknown>) {
  const [total, active, blocked, marketAggregation] = await Promise.all([
    CustomerModel.countDocuments(scopedQuery).exec(),
    CustomerModel.countDocuments({ ...scopedQuery, status: "active" }).exec(),
    CustomerModel.countDocuments({ ...scopedQuery, status: "blacklisted" }).exec(),
    CustomerModel.aggregate<{ _id: string }>([
      { $match: scopedQuery },
      { $group: { _id: "$market" } },
    ]).exec(),
  ]);

  return {
    total,
    active,
    blocked,
    markets: marketAggregation.length,
  };
}

export async function listCustomers(query: ListCustomersQuery) {
  await ensureMerchant(query.merchantId);

  const scopedFilters: Record<string, unknown>[] = [
    {
      merchantId: query.merchantId,
    },
  ];

  if (query.environment) {
    scopedFilters.push(createRuntimeModeCondition("environment", query.environment));
  }

  const scopedQuery =
    scopedFilters.length === 1
      ? scopedFilters[0]
      : {
          $and: scopedFilters,
        };
  const filters: Record<string, unknown>[] = [...scopedFilters];

  if (query.status) {
    filters.push({
      status: query.status,
    });
  }

  if (query.market) {
    filters.push({
      market: query.market,
    });
  }

  if (query.search) {
    filters.push(buildCustomerSearchFilter(query.search));
  }

  const listQuery =
    filters.length === 1
      ? filters[0]
      : {
          $and: filters,
        };

  const pagination = resolvePagination(query);

  if (!pagination) {
    const [summary, customers] = await Promise.all([
      getCustomerSummary(scopedQuery),
      CustomerModel.find(listQuery)
        .sort({ updatedAt: -1 })
        .exec(),
    ]);

    return {
      items: customers.map(toCustomerResponse),
      summary,
    } satisfies ListResult<ReturnType<typeof toCustomerResponse>>;
  }

  const [total, summary, customers] = await Promise.all([
    CustomerModel.countDocuments(listQuery).exec(),
    getCustomerSummary(scopedQuery),
    CustomerModel.find(listQuery)
      .sort({ updatedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: customers.map(toCustomerResponse),
    pagination: buildPagination(pagination.page, pagination.limit, total),
    summary,
  } satisfies ListResult<ReturnType<typeof toCustomerResponse>>;
}

export async function getCustomerById(
  customerId: string,
  merchantId: string,
  environment: RuntimeMode
) {
  await ensureMerchant(merchantId);
  const customer = await ensureCustomer(customerId, merchantId, environment);

  return toCustomerResponse(customer);
}

export async function createCustomer(input: CreateCustomerInput) {
  const merchant = await ensureMerchant(input.merchantId);

  if (!merchant.supportedMarkets.includes(input.market)) {
    throw new HttpError(
      409,
      `Customer market ${input.market} is not enabled for this merchant.`
    );
  }

  const existing = await CustomerModel.findOne({
    $and: [
      {
        merchantId: input.merchantId,
        ...createRuntimeModeCondition("environment", input.environment),
      },
      {
        $or: [{ customerRef: input.customerRef }, { email: input.email }],
      },
    ],
  }).exec();

  if (existing) {
    throw new HttpError(409, "Customer with this ref or email already exists.");
  }

  const created = await CustomerModel.create({
    merchantId: input.merchantId,
    environment: input.environment,
    customerRef: input.customerRef,
    name: input.name,
    email: input.email,
    market: input.market,
    status: input.status,
    monthlyVolumeUsdc: input.monthlyVolumeUsdc,
    metadata: input.metadata,
    blacklistedAt: input.status === "blacklisted" ? new Date() : null,
    blacklistReason: null,
  });

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Created customer",
    category: "customer",
    status: "ok",
    target: input.email,
    detail: `${input.name} was added to customer directory.`,
    metadata: {
      customerRef: input.customerRef,
      market: input.market,
      status: input.status,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toCustomerResponse(created);
}

export async function updateCustomer(
  customerId: string,
  merchantId: string,
  environment: RuntimeMode,
  input: UpdateCustomerInput
) {
  const merchant = await ensureMerchant(merchantId);
  const customer = await ensureCustomer(customerId, merchantId, environment);

  if (input.name !== undefined) {
    customer.name = input.name;
  }

  if (input.email !== undefined) {
    customer.email = input.email;
  }

  if (input.market !== undefined) {
    if (!merchant.supportedMarkets.includes(input.market)) {
      throw new HttpError(
        409,
        `Customer market ${input.market} is not enabled for this merchant.`
      );
    }
    customer.market = input.market;
  }

  if (input.status !== undefined) {
    customer.status = input.status;

    if (input.status !== "blacklisted") {
      customer.blacklistedAt = null;
      customer.blacklistReason = null;
    }
  }

  if (input.monthlyVolumeUsdc !== undefined) {
    customer.monthlyVolumeUsdc = input.monthlyVolumeUsdc;
  }

  if (input.metadata !== undefined) {
    customer.metadata = {
      ...(customer.metadata ?? {}),
      ...input.metadata,
    };
  }

  await customer.save();

  await appendAuditLog({
    merchantId,
    actor: input.actor,
    action: "Updated customer",
    category: "customer",
    status: "ok",
    target: customer.email,
    detail: `Updated profile for ${customer.name}.`,
    metadata: {
      status: customer.status,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toCustomerResponse(customer);
}

export async function blacklistCustomer(
  customerId: string,
  input: BlacklistCustomerInput
) {
  await ensureMerchant(input.merchantId);
  const customer = await ensureCustomer(
    customerId,
    input.merchantId,
    input.environment
  );

  customer.status = "blacklisted";
  customer.blacklistedAt = new Date();
  customer.blacklistReason = input.reason;
  await customer.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Blacklisted customer",
    category: "security",
    status: "warning",
    target: customer.email,
    detail: `${customer.name} was blacklisted.`,
    metadata: {
      reason: input.reason,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toCustomerResponse(customer);
}
