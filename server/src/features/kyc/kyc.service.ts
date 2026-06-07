import { createHash } from "crypto";

import { getDiditConfig } from "@/config/didit.config";
import { appendAuditLog } from "@/features/audit/audit.service";
import { KycEventModel } from "@/features/kyc/kyc-event.model";
import { KycCheckModel } from "@/features/kyc/kyc.model";
import { getDiditProvider } from "@/features/kyc/providers/didit/didit.factory";
import type { DiditReviewSnapshot } from "@/features/kyc/providers/didit/didit.types";
import type {
  DiditWebhookInput,
  StartMerchantKybInput,
  StartOwnerKycInput,
  SyncMerchantKybInput,
  SyncOwnerKycInput,
} from "@/features/kyc/kyc.validation";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { queueVerificationNotification } from "@/features/notifications/notification.service";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

type KycSubjectType = "merchant" | "owner";
type KycStatus = "not_started" | "pending" | "approved" | "rejected" | "on_hold";
const VERIFICATION_SCOPE = "global";

function toStringOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function splitName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  const [firstName = "Account", ...rest] = normalized.split(" ");

  return {
    firstName: firstName.trim(),
    lastName: rest.join(" ").trim() || "Owner",
  };
}

function buildExternalUserId(input: {
  subjectType: KycSubjectType;
  merchantId: string;
  subjectRef: string;
}) {
  if (input.subjectType === "merchant") {
    return `renew:verification:merchant:${input.merchantId}`;
  }

  return `renew:verification:owner:${input.merchantId}:${input.subjectRef}`;
}

function deriveStatusFromReview(review: DiditReviewSnapshot, eventType?: string): KycStatus {
  const reviewAnswer = review.reviewAnswer?.toUpperCase() ?? null;
  const reviewStatus = review.status?.toLowerCase() ?? null;
  const normalizedEvent = eventType?.trim().toLowerCase() ?? "";

  if (reviewAnswer === "GREEN" || reviewAnswer === "APPROVED" || reviewStatus === "approved") {
    return "approved";
  }

  if (reviewAnswer === "RED" || reviewAnswer === "DECLINED" || reviewStatus === "declined") {
    return "rejected";
  }

  if (
    reviewStatus?.includes("hold") ||
    reviewStatus?.includes("expired") ||
    reviewStatus?.includes("abandoned") ||
    normalizedEvent.includes("onhold")
  ) {
    return "on_hold";
  }

  if (
    reviewStatus?.includes("pending") ||
    reviewStatus?.includes("init") ||
    reviewStatus?.includes("progress") ||
    reviewStatus?.includes("review") ||
    reviewStatus?.includes("awaiting") ||
    reviewStatus?.includes("resubmitted") ||
    reviewStatus?.includes("not started") ||
    reviewStatus?.includes("queued") ||
    normalizedEvent.includes("created") ||
    normalizedEvent.includes("pending")
  ) {
    return "pending";
  }

  return "pending";
}

function toKycResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  subjectType: string;
  subjectRef: string;
  provider: string;
  mode: string;
  externalUserId: string;
  applicantId?: string | null;
  levelName: string;
  status: string;
  reviewStatus?: string | null;
  reviewAnswer?: string | null;
  rejectType?: string | null;
  rejectLabels?: string[];
  moderationComment?: string | null;
  clientComment?: string | null;
  lastEventType?: string | null;
  lastEventAt?: Date | null;
  completedAt?: Date | null;
  lastSyncedAt?: Date | null;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    subjectType: document.subjectType,
    subjectRef: document.subjectRef,
    provider: document.provider,
    mode: document.mode,
    externalUserId: document.externalUserId,
    applicantId: document.applicantId ?? null,
    levelName: document.levelName,
    status: document.status,
    reviewStatus: document.reviewStatus ?? null,
    reviewAnswer: document.reviewAnswer ?? null,
    rejectType: document.rejectType ?? null,
    rejectLabels: document.rejectLabels ?? [],
    moderationComment: document.moderationComment ?? null,
    clientComment: document.clientComment ?? null,
    lastEventType: document.lastEventType ?? null,
    lastEventAt: document.lastEventAt ?? null,
    completedAt: document.completedAt ?? null,
    lastSyncedAt: document.lastSyncedAt ?? null,
    metadata: document.metadata ?? {},
    createdBy: document.createdBy ?? "system",
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function getMerchantOrThrow(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

async function getOrCreateKycRecord(input: {
  merchantId: string;
  subjectType: KycSubjectType;
  subjectRef: string;
  workflowId: string;
  actor: string;
}) {
  const externalUserId = buildExternalUserId(input);
  let record = await KycCheckModel.findOne({
    merchantId: input.merchantId,
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    mode: VERIFICATION_SCOPE,
  }).exec();

  if (!record) {
    record = await KycCheckModel.create({
      merchantId: input.merchantId,
      subjectType: input.subjectType,
      subjectRef: input.subjectRef,
      provider: "didit",
      mode: VERIFICATION_SCOPE,
      externalUserId,
      levelName: input.workflowId,
      status: "not_started",
      createdBy: input.actor,
    });
  } else {
    record.provider = "didit";
    record.externalUserId = externalUserId;

    if (record.levelName !== input.workflowId) {
      record.levelName = input.workflowId;
    }

    await record.save();
  }

  return record;
}

function applyReviewSnapshot(input: {
  record: Awaited<ReturnType<typeof getOrCreateKycRecord>>;
  review: DiditReviewSnapshot;
  eventType: string;
}) {
  const status = deriveStatusFromReview(input.review, input.eventType);
  const now = new Date();

  input.record.status = status;
  input.record.reviewStatus = input.review.status;
  input.record.reviewAnswer = input.review.reviewAnswer;
  input.record.rejectType = input.review.rejectType;
  input.record.rejectLabels = input.review.rejectLabels;
  input.record.moderationComment = input.review.moderationComment;
  input.record.clientComment = input.review.clientComment;
  input.record.lastEventType = input.eventType;
  input.record.lastEventAt = now;
  input.record.lastSyncedAt = now;

  if (status === "approved") {
    input.record.completedAt = now;
  } else if (status === "rejected" || status === "on_hold") {
    input.record.completedAt = null;
  }
}

function extractReviewFromWebhook(payload: DiditWebhookInput): DiditReviewSnapshot {
  const decision =
    typeof payload.decision === "object" && payload.decision !== null
      ? (payload.decision as Record<string, unknown>)
      : {};
  const reviews = Array.isArray(decision.reviews) ? decision.reviews : [];
  const latestReview =
    typeof reviews[reviews.length - 1] === "object" && reviews[reviews.length - 1] !== null
      ? (reviews[reviews.length - 1] as Record<string, unknown>)
      : {};
  const resubmitInfo =
    typeof payload.resubmit_info === "object" && payload.resubmit_info !== null
      ? (payload.resubmit_info as Record<string, unknown>)
      : {};
  const reasons =
    typeof resubmitInfo.reasons === "object" && resubmitInfo.reasons !== null
      ? (resubmitInfo.reasons as Record<string, unknown>)
      : {};
  const status =
    toStringOrNull(payload.status) ??
    toStringOrNull(decision.status) ??
    toStringOrNull(latestReview.new_status);

  return {
    status,
    reviewAnswer: status,
    rejectType: toStringOrNull(payload.previous_status),
    rejectLabels: [...new Set([...toStringArray(payload.rejectLabels), ...Object.keys(reasons)])],
    moderationComment:
      toStringOrNull(latestReview.comment) ??
      toStringOrNull(payload.comment) ??
      null,
    clientComment:
      toStringOrNull(reasons[Object.keys(reasons)[0]]) ??
      toStringOrNull(payload.reason) ??
      null,
  };
}

function createUnavailableKycResponse(input: {
  subjectType: KycSubjectType;
  subjectRef: string;
  workflowId: string;
  required?: boolean;
  available?: boolean;
  reason?: string | null;
  status?: KycStatus;
}) {
  return {
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    status: input.status ?? "not_started",
    provider: "didit",
    mode: VERIFICATION_SCOPE,
    applicantId: null,
    reviewStatus: null,
    reviewAnswer: null,
    rejectType: null,
    rejectLabels: [],
    moderationComment: null,
    clientComment: null,
    lastEventType: null,
    lastEventAt: null,
    completedAt: null,
    lastSyncedAt: null,
    levelName: input.workflowId,
    metadata: {
      available: input.available ?? false,
      required: input.required ?? false,
      reason: input.reason ?? null,
    },
  };
}

function getConfiguredWorkflowId(value: string | undefined, fallback: string) {
  const workflowId = (value ?? fallback).trim();

  if (!workflowId) {
    throw new HttpError(500, "Verification workflow is not configured.");
  }

  return workflowId;
}

function getVerificationCallbackUrl() {
  return `${getDiditConfig().callbackUrl.replace(/\/+$/, "")}/dashboard/onboarding`;
}

function getBypassedVerificationResponse(input: {
  subjectType: KycSubjectType;
  subjectRef: string;
  workflowId: string;
}) {
  return createUnavailableKycResponse({
    ...input,
    status: "approved",
    required: false,
    available: false,
    reason: "Verification onboarding is disabled.",
  });
}

function buildDiditWebhookRecordQueries(input: {
  applicantId: string | null;
  externalUserId: string | null;
}) {
  const queries: Array<Record<string, string>> = [];

  if (input.applicantId) {
    queries.push({
      applicantId: input.applicantId,
      mode: VERIFICATION_SCOPE,
    });
  }

  if (input.externalUserId) {
    queries.push({
      externalUserId: input.externalUserId,
      mode: VERIFICATION_SCOPE,
    });
  }

  return queries;
}

async function findKycRecordForDiditWebhook(input: {
  applicantId: string | null;
  externalUserId: string | null;
}) {
  for (const query of buildDiditWebhookRecordQueries(input)) {
    const record = await KycCheckModel.findOne(query).exec();

    if (record) {
      return record;
    }
  }

  return null;
}

export async function getMerchantKybStatusByMerchantId(
  merchantId: string
) {
  await getMerchantOrThrow(merchantId);
  const config = getDiditConfig();

  if (!config.enabled) {
    return getBypassedVerificationResponse({
      subjectType: "merchant",
      subjectRef: merchantId,
      workflowId: config.workflowIdKyb,
    });
  }

  const record = await KycCheckModel.findOne({
    merchantId,
    subjectType: "merchant",
    subjectRef: merchantId,
    mode: VERIFICATION_SCOPE,
  }).exec();

  if (!record) {
    return createUnavailableKycResponse({
      subjectType: "merchant",
      subjectRef: merchantId,
      workflowId: config.workflowIdKyb,
      required: false,
      available: true,
      reason: null,
    });
  }

  const response = toKycResponse(record);

  return {
    ...response,
    metadata: {
      ...(response.metadata ?? {}),
      available: true,
      required: false,
    },
  };
}

export async function getOwnerKycStatusByMerchantId(input: {
  merchantId: string;
  environment?: RuntimeMode;
}) {
  await getMerchantOrThrow(input.merchantId);
  const config = getDiditConfig();

  if (!config.enabled) {
    return getBypassedVerificationResponse({
      subjectType: "owner",
      subjectRef: input.merchantId,
      workflowId: config.workflowIdKyc,
    });
  }

  const record = await KycCheckModel.findOne({
    merchantId: input.merchantId,
    subjectType: "owner",
    subjectRef: input.merchantId,
    mode: VERIFICATION_SCOPE,
  }).exec();

  if (!record) {
    return createUnavailableKycResponse({
      subjectType: "owner",
      subjectRef: input.merchantId,
      workflowId: config.workflowIdKyc,
      required: true,
      available: true,
      reason: null,
    });
  }

  const response = toKycResponse(record);

  return {
    ...response,
    metadata: {
      ...(response.metadata ?? {}),
      available: true,
      required: true,
    },
  };
}

export async function startMerchantKybSession(input: StartMerchantKybInput) {
  const merchant = await getMerchantOrThrow(input.merchantId);
  const config = getDiditConfig();

  if (!config.enabled) {
    throw new HttpError(409, "Verification onboarding is not enabled.");
  }

  const diditProvider = getDiditProvider();
  const workflowId = getConfiguredWorkflowId(input.workflowId ?? input.levelName, config.workflowIdKyb);

  const record = await getOrCreateKycRecord({
    merchantId: input.merchantId,
    subjectType: "merchant",
    subjectRef: input.merchantId,
    workflowId,
    actor: input.actor,
  });

  const session = await diditProvider.createSession({
    workflowId,
    vendorData: record.externalUserId,
    callback: getVerificationCallbackUrl(),
    language: input.lang,
    contactDetails: {
      email: merchant.supportEmail ?? undefined,
    },
    expectedDetails: {
      company_name: input.companyName ?? merchant.name ?? undefined,
      registration_number: input.registrationNumber,
      country: input.country,
      tax_id: input.taxId,
    },
    metadata: {
      merchantId: input.merchantId,
      subjectType: "merchant",
    },
  });

  record.applicantId = session.sessionId;
  record.externalUserId = session.vendorData;
  record.levelName = session.workflowId;
  applyReviewSnapshot({
    record,
    review: session.review,
    eventType: "session.created",
  });
  record.metadata = {
    ...(record.metadata as Record<string, unknown>),
    sessionKind: session.sessionKind,
    verificationUrl: session.url,
    sessionToken: session.sessionToken,
    lastSession: session.raw,
  };
  await record.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Started merchant KYB verification",
    category: "security",
    status: "ok",
    target: merchant.name ?? merchant.supportEmail ?? null,
    detail: "Merchant KYB verification was initiated.",
    metadata: {
      subjectType: record.subjectType,
      workflowId: record.levelName,
      sessionId: record.applicantId,
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    kyc: toKycResponse(record),
    verificationUrl: session.url,
    sessionId: session.sessionId,
    sessionToken: session.sessionToken,
    userId: session.vendorData,
  };
}

export async function startOwnerKycSession(input: StartOwnerKycInput) {
  const merchant = await getMerchantOrThrow(input.merchantId);
  const config = getDiditConfig();

  if (!config.enabled) {
    throw new HttpError(409, "Verification onboarding is not enabled.");
  }

  if (!merchant.ownerName?.trim()) {
    throw new HttpError(409, "Save business details before starting owner verification.");
  }
  const diditProvider = getDiditProvider();
  const workflowId = getConfiguredWorkflowId(input.workflowId ?? input.levelName, config.workflowIdKyc);
  const names = splitName(merchant.ownerName);

  const record = await getOrCreateKycRecord({
    merchantId: input.merchantId,
    subjectType: "owner",
    subjectRef: input.merchantId,
    workflowId,
    actor: input.actor,
  });

  const session = await diditProvider.createSession({
    workflowId,
    vendorData: record.externalUserId,
    callback: getVerificationCallbackUrl(),
    language: input.lang,
    contactDetails: {
      email: merchant.supportEmail ?? undefined,
    },
    expectedDetails: {
      first_name: names.firstName,
      last_name: names.lastName,
      id_country: input.country,
    },
    metadata: {
      merchantId: input.merchantId,
      subjectType: "owner",
    },
  });

  record.applicantId = session.sessionId;
  record.externalUserId = session.vendorData;
  record.levelName = session.workflowId;
  applyReviewSnapshot({
    record,
    review: session.review,
    eventType: "session.created",
  });
  record.metadata = {
    ...(record.metadata as Record<string, unknown>),
    sessionKind: session.sessionKind,
    verificationUrl: session.url,
    sessionToken: session.sessionToken,
    lastSession: session.raw,
  };
  await record.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Started owner KYC verification",
    category: "security",
    status: "ok",
    target: merchant.supportEmail ?? merchant.name ?? null,
    detail: "Owner KYC verification was initiated.",
    metadata: {
      subjectType: record.subjectType,
      workflowId: record.levelName,
      sessionId: record.applicantId,
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    kyc: toKycResponse(record),
    verificationUrl: session.url,
    sessionId: session.sessionId,
    sessionToken: session.sessionToken,
    userId: session.vendorData,
  };
}

export async function syncMerchantKybStatus(input: SyncMerchantKybInput) {
  await getMerchantOrThrow(input.merchantId);
  const config = getDiditConfig();

  if (!config.enabled) {
    throw new HttpError(409, "Verification onboarding is not enabled.");
  }

  const diditProvider = getDiditProvider();
  const record = await KycCheckModel.findOne({
    merchantId: input.merchantId,
    subjectType: "merchant",
    subjectRef: input.merchantId,
    mode: VERIFICATION_SCOPE,
  }).exec();

  if (!record || !record.applicantId) {
    throw new HttpError(409, "Merchant KYB has not been started yet.");
  }

  const review = await diditProvider.getSessionDecision(record.applicantId);
  applyReviewSnapshot({
    record,
    review,
    eventType: "manualSync",
  });
  record.metadata = {
    ...(record.metadata as Record<string, unknown>),
    lastSync: review.raw,
  };
  await record.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Synced merchant KYB status",
    category: "security",
    status: "ok",
    target: record.applicantId,
    detail: "Merchant KYB status was refreshed.",
    metadata: {
      status: record.status,
      reviewStatus: record.reviewStatus,
      reviewAnswer: record.reviewAnswer,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toKycResponse(record);
}

export async function syncOwnerKycStatus(input: SyncOwnerKycInput) {
  await getMerchantOrThrow(input.merchantId);
  const config = getDiditConfig();

  if (!config.enabled) {
    throw new HttpError(409, "Verification onboarding is not enabled.");
  }

  const diditProvider = getDiditProvider();
  const record = await KycCheckModel.findOne({
    merchantId: input.merchantId,
    subjectType: "owner",
    subjectRef: input.merchantId,
    mode: VERIFICATION_SCOPE,
  }).exec();

  if (!record || !record.applicantId) {
    throw new HttpError(409, "Owner KYC has not been started yet.");
  }

  const review = await diditProvider.getSessionDecision(record.applicantId);
  applyReviewSnapshot({
    record,
    review,
    eventType: "manualSync",
  });
  record.metadata = {
    ...(record.metadata as Record<string, unknown>),
    lastSync: review.raw,
  };
  await record.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Synced owner KYC status",
    category: "security",
    status: "ok",
    target: input.merchantId,
    detail: "Owner KYC status was refreshed.",
    metadata: {
      status: record.status,
      reviewStatus: record.reviewStatus,
      reviewAnswer: record.reviewAnswer,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toKycResponse(record);
}

export async function processDiditWebhook(input: {
  payload: DiditWebhookInput;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  signatureV2Header: string | null;
  signatureSimpleHeader: string | null;
  environment?: RuntimeMode;
}) {
  const externalUserId =
    toStringOrNull(input.payload.vendor_data) ??
    toStringOrNull(input.payload.externalUserId) ??
    toStringOrNull(input.payload.vendor_user_id);
  const config = getDiditConfig();
  const diditProvider = getDiditProvider();
  const hasConfiguredWebhookSecret = config.webhookSecret.length > 0;
  const signatureMatches = diditProvider.verifyWebhookSignature({
    rawBody: input.rawBody,
    payload: input.payload,
    timestamp: input.timestampHeader,
    signature: input.signatureHeader,
    signatureV2: input.signatureV2Header,
    signatureSimple: input.signatureSimpleHeader,
  });

  if (hasConfiguredWebhookSecret && !signatureMatches) {
    throw new HttpError(401, "Invalid verification webhook signature.");
  }

  const eventType =
    toStringOrNull(input.payload.webhook_type) ??
    toStringOrNull(input.payload.type) ??
    "unknown";
  const eventKey =
    toStringOrNull(input.payload.event_id) ??
    createHash("sha256").update(input.rawBody, "utf8").digest("hex");
  const existingEvent = await KycEventModel.findOne({
    provider: "didit",
    environment: VERIFICATION_SCOPE,
    eventKey,
  }).exec();

  if (existingEvent?.processedAt) {
    return {
      processed: true,
      idempotent: true,
      matched: Boolean(existingEvent.result),
      eventType,
    };
  }

  let event = existingEvent;

  if (!event) {
    try {
      event = await KycEventModel.create({
        provider: "didit",
        environment: VERIFICATION_SCOPE,
        eventKey,
        eventType,
        applicantId: toStringOrNull(input.payload.session_id),
        externalUserId,
        payload: input.payload,
      });
    } catch (error) {
      const maybeDuplicate = error as { code?: number };

      if (maybeDuplicate.code === 11000) {
        event = await KycEventModel.findOne({
          provider: "didit",
          environment: VERIFICATION_SCOPE,
          eventKey,
        }).exec();
      } else {
        throw error;
      }
    }
  }

  if (!event) {
    throw new HttpError(500, "Unable to persist verification webhook event.");
  }

  const applicantId = toStringOrNull(input.payload.session_id);
  const record = await findKycRecordForDiditWebhook({
    applicantId,
    externalUserId,
  });

  if (!record) {
    event.result = {
      processed: false,
      matched: false,
      eventType,
      applicantId,
      externalUserId,
    };
    event.processedAt = new Date();
    await event.save();

    return {
      processed: true,
      idempotent: false,
      matched: false,
      eventType,
      applicantId,
      externalUserId,
    };
  }

  const review = extractReviewFromWebhook(input.payload);
  applyReviewSnapshot({
    record,
    review,
    eventType,
  });
  record.metadata = {
    ...(record.metadata as Record<string, unknown>),
    lastWebhook: input.payload,
  };
  await record.save();

  await appendAuditLog({
    merchantId: record.merchantId.toString(),
    actor: "verification-webhook",
    action: "Processed verification webhook",
    category: "security",
    status: "ok",
    target: record.subjectRef,
    detail: `Verification update received for ${record.subjectType}.`,
    metadata: {
      eventType,
      subjectType: record.subjectType,
      status: record.status,
      reviewStatus: record.reviewStatus,
      reviewAnswer: record.reviewAnswer,
      rejectType: record.rejectType,
    },
    ipAddress: null,
    userAgent: null,
  });

  await queueVerificationNotification({
    merchantId: record.merchantId.toString(),
    environment: "live",
    subjectType: record.subjectType,
    status: record.status,
    reviewAnswer: record.reviewAnswer ?? null,
  }).catch((notificationError) => {
    console.error("[verification-webhook] Failed to queue verification notification:", notificationError);
  });

  const result = {
    processed: true,
    idempotent: false,
    matched: true,
    eventType,
    subjectType: record.subjectType,
    subjectRef: record.subjectRef,
    status: record.status,
    applicantId: record.applicantId,
  };

  event.result = result;
  event.processedAt = new Date();
  await event.save();

  return result;
}

export async function getMerchantVerificationAccessForLive(
  merchantId: string,
  mode: RuntimeMode
) {
  const config = getDiditConfig();

  if (mode !== "live" || !config.enabled) {
    return {
      verified: true,
      tier: "business" as const,
    };
  }

  const records = await KycCheckModel.find({
    merchantId,
    subjectType: { $in: ["owner", "merchant"] },
    subjectRef: merchantId,
    mode: VERIFICATION_SCOPE,
  })
    .select({ status: 1, subjectType: 1 })
    .lean()
    .exec();
  const businessApproved = records.some(
    (record) => record.subjectType === "merchant" && record.status === "approved"
  );
  const ownerApproved = records.some(
    (record) => record.subjectType === "owner" && record.status === "approved"
  );

  return {
    verified: businessApproved || ownerApproved,
    tier: businessApproved ? ("business" as const) : ownerApproved ? ("owner" as const) : ("none" as const),
  };
}

export async function assertMerchantKybApprovedForLive(
  merchantId: string,
  action = "running this live operation",
  mode: RuntimeMode
) {
  const access = await getMerchantVerificationAccessForLive(merchantId, mode);

  if (!access.verified) {
    throw new HttpError(
      403,
      `Owner KYC or business KYB must be approved before ${action}.`
    );
  }

  return access;
}

export const __test__ = {
  buildDiditWebhookRecordQueries,
};
