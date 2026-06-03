import { AuditModel } from "@/features/audit/audit.model";
import { CustomerModel } from "@/features/customers/customer.model";
import { DeveloperDeliveryModel } from "@/features/developers/developer-delivery.model";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { PaymentModel } from "@/features/payments/payment.model";
import { PayoutModel } from "@/features/payouts/payout.model";
import type {
  HistoryType,
  ListHistoryQuery,
} from "@/features/history/history.validation";
import { HttpError } from "@/shared/errors/http-error";
import { buildPagination } from "@/shared/utils/pagination";
import { createRuntimeModeCondition } from "@/shared/utils/runtime-environment";

type HistoryItem = {
  id: string;
  type: HistoryType;
  title: string;
  status: string;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  createdAt: Date;
  metadata: Record<string, unknown>;
};

function shouldFetch(query: ListHistoryQuery, type: HistoryType) {
  return !query.type || query.type === type;
}

function buildPattern(search?: string) {
  if (!search) {
    return null;
  }

  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

function createScopedQuery(query: ListHistoryQuery) {
  return {
    merchantId: query.merchantId,
    ...(query.environment
      ? createRuntimeModeCondition("environment", query.environment)
      : {}),
  };
}

function applyStatus<T extends Record<string, unknown>>(
  mongoQuery: T,
  query: ListHistoryQuery
) {
  if (!query.status) {
    return mongoQuery;
  }

  return {
    ...mongoQuery,
    status: query.status,
  };
}

export async function listHistory(query: ListHistoryQuery) {
  const merchantExists = await MerchantModel.exists({ _id: query.merchantId });

  if (!merchantExists) {
    throw new HttpError(404, "Merchant was not found.");
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const fetchLimit = page * limit;
  const pattern = buildPattern(query.search);
  const scopedQuery = createScopedQuery(query);

  const fetchers: Array<Promise<HistoryItem[]>> = [];

  if (shouldFetch(query, "payment")) {
    const paymentQuery = applyStatus({ ...scopedQuery }, query);

    if (pattern) {
      Object.assign(paymentQuery, {
        $or: [
          { payId: pattern },
          { description: pattern },
          { currency: pattern },
        ],
      });
    }

    fetchers.push(
      PaymentModel.find(paymentQuery)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean()
        .exec()
        .then((documents) =>
          documents.map((document) => ({
            id: String(document._id),
            type: "payment" as const,
            title: document.description,
            status: document.status,
            amount: document.amount,
            currency: document.currency,
            reference: document.payId,
            createdAt: document.createdAt,
            metadata: {
              recurring: document.recurring?.enabled ?? false,
              paymentUrl: document.paymentUrl,
            },
          }))
        )
    );
  }

  if (shouldFetch(query, "payout")) {
    const payoutQuery = applyStatus({ ...scopedQuery }, query);

    if (pattern) {
      Object.assign(payoutQuery, {
        $or: [
          { batchRef: pattern },
          { destinationWallet: pattern },
          { txHash: pattern },
          { creditTxHash: pattern },
          { vaultBatchId: pattern },
          { vaultDepositTxHash: pattern },
          { vaultReleaseTxHash: pattern },
        ],
      });
    }

    fetchers.push(
      PayoutModel.find(payoutQuery)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean()
        .exec()
        .then((documents) =>
          documents.map((document) => ({
            id: String(document._id),
            type: "payout" as const,
            title: document.batchRef,
            status: document.status,
            amount: document.netUsdc,
            currency: "USDC",
            reference:
              document.vaultReleaseTxHash ??
              document.creditTxHash ??
              document.vaultDepositTxHash ??
              document.txHash ??
              document.batchRef,
            createdAt: document.createdAt,
            metadata: {
              destinationWallet: document.destinationWallet,
              scheduledFor: document.scheduledFor,
              vaultBatchId: document.vaultBatchId ?? null,
            },
          }))
        )
    );
  }

  if (shouldFetch(query, "customer")) {
    const customerQuery = applyStatus({ ...scopedQuery }, query);

    if (pattern) {
      Object.assign(customerQuery, {
        $or: [
          { customerRef: pattern },
          { name: pattern },
          { email: pattern },
          { market: pattern },
        ],
      });
    }

    fetchers.push(
      CustomerModel.find(customerQuery)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean()
        .exec()
        .then((documents) =>
          documents.map((document) => ({
            id: String(document._id),
            type: "customer" as const,
            title: document.name,
            status: document.status,
            amount: document.monthlyVolumeUsdc,
            currency: "USDC",
            reference: document.customerRef,
            createdAt: document.createdAt,
            metadata: {
              email: document.email,
              market: document.market,
            },
          }))
        )
    );
  }

  if (shouldFetch(query, "developer_event")) {
    const developerQuery = applyStatus({ ...scopedQuery }, query);

    if (pattern) {
      Object.assign(developerQuery, {
        $or: [
          { eventId: pattern },
          { eventType: pattern },
          { errorMessage: pattern },
        ],
      });
    }

    fetchers.push(
      DeveloperDeliveryModel.find(developerQuery)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean()
        .exec()
        .then((documents) =>
          documents.map((document) => ({
            id: String(document._id),
            type: "developer_event" as const,
            title: document.eventType,
            status: document.status,
            amount: null,
            currency: null,
            reference: document.eventId,
            createdAt: document.createdAt,
            metadata: {
              attempts: document.attempts,
              httpStatus: document.httpStatus ?? null,
            },
          }))
        )
    );
  }

  if (shouldFetch(query, "workspace_event")) {
    const auditQuery: Record<string, unknown> = {
      merchantId: query.merchantId,
    };

    if (query.status) {
      auditQuery.status = query.status;
    }

    if (pattern) {
      auditQuery.$or = [
        { actor: pattern },
        { action: pattern },
        { detail: pattern },
        { target: pattern },
      ];
    }

    fetchers.push(
      AuditModel.find(auditQuery)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean()
        .exec()
        .then((documents) =>
          documents.map((document) => ({
            id: String(document._id),
            type: "workspace_event" as const,
            title: document.action,
            status: document.status,
            amount: null,
            currency: null,
            reference: document.target ?? null,
            createdAt: document.createdAt,
            metadata: {
              actor: document.actor,
              category: document.category,
              detail: document.detail,
            },
          }))
        )
    );
  }

  const allItems = (await Promise.all(fetchers))
    .flat()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const skip = (page - 1) * limit;
  const items = allItems.slice(skip, skip + limit);

  return {
    items,
    pagination: buildPagination(page, limit, allItems.length),
  };
}
