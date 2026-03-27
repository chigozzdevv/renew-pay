import { HttpError } from "@/shared/errors/http-error";

import { AuditModel } from "@/features/audit/audit.model";
import type {
  CreateAuditInput,
  ListAuditQuery,
} from "@/features/audit/audit.validation";
import { MerchantModel } from "@/features/merchants/merchant.model";

function toAuditResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  actor: string;
  action: string;
  category: string;
  status: string;
  target?: string | null;
  detail: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    actor: document.actor,
    action: document.action,
    category: document.category,
    status: document.status,
    target: document.target ?? null,
    detail: document.detail,
    metadata: document.metadata ?? {},
    ipAddress: document.ipAddress ?? null,
    userAgent: document.userAgent ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function createAuditLog(input: CreateAuditInput) {
  const merchantExists = await MerchantModel.exists({ _id: input.merchantId });

  if (!merchantExists) {
    throw new HttpError(404, "Merchant was not found.");
  }

  const createdAudit = await AuditModel.create({
    merchantId: input.merchantId,
    actor: input.actor,
    action: input.action,
    category: input.category,
    status: input.status,
    target: input.target,
    detail: input.detail,
    metadata: input.metadata,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return toAuditResponse(createdAudit);
}

export async function appendAuditLog(input: CreateAuditInput) {
  const createdAudit = await AuditModel.create({
    merchantId: input.merchantId,
    actor: input.actor,
    action: input.action,
    category: input.category,
    status: input.status,
    target: input.target,
    detail: input.detail,
    metadata: input.metadata,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return toAuditResponse(createdAudit);
}

export async function listAuditLogs(query: ListAuditQuery) {
  const merchantExists = await MerchantModel.exists({ _id: query.merchantId });

  if (!merchantExists) {
    throw new HttpError(404, "Merchant was not found.");
  }

  const mongoQuery: Record<string, unknown> = {
    merchantId: query.merchantId,
  };

  if (query.category) {
    mongoQuery.category = query.category;
  }

  if (query.status) {
    mongoQuery.status = query.status;
  }

  if (query.search) {
    const pattern = new RegExp(query.search, "i");
    mongoQuery.$or = [
      { actor: pattern },
      { action: pattern },
      { detail: pattern },
      { target: pattern },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [total, documents] = await Promise.all([
    AuditModel.countDocuments(mongoQuery).exec(),
    AuditModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .exec(),
  ]);

  return {
    items: documents.map(toAuditResponse),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}
