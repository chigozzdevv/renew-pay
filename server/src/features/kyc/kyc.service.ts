import { createHash } from "crypto";

import { getSumsubConfig } from "@/config/sumsub.config";
import { appendAuditLog } from "@/features/audit/audit.service";
import { KycCheckModel } from "@/features/kyc/kyc.model";
import { KycEventModel } from "@/features/kyc/kyc-event.model";
import { getSumsubProvider } from "@/features/kyc/providers/sumsub/sumsub.factory";
import type {
  SumsubReviewSnapshot,
} from "@/features/kyc/providers/sumsub/sumsub.types";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { queueVerificationNotification } from "@/features/notifications/notification.service";
import { TeamMemberModel } from "@/features/teams/team.model";
import type {
  StartMerchantKybInput,
  StartTeamMemberKycInput,
  SumsubWebhookInput,
  SyncMerchantKybInput,
  SyncTeamMemberKycInput,
} from "@/features/kyc/kyc.validation";
import { liveOnboardingDisabledMessage, liveOnboardingEnabled } from "@/shared/constants/live-onboarding";
import { HttpError } from "@/shared/errors/http-error";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

type KycSubjectType = "merchant" | "team_member";
type KycStatus = "not_started" | "pending" | "approved" | "rejected" | "on_hold";

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
  const [firstName = "Team", ...rest] = normalized.split(" ");

  return {
    firstName: firstName.trim(),
    lastName: rest.join(" ").trim() || "Member",
  };
}

function buildExternalUserId(input: {
  subjectType: KycSubjectType;
  merchantId: string;
  subjectRef: string;
  mode: RuntimeMode;
}) {
  if (input.subjectType === "merchant") {
    return `renew:${input.mode}:merchant:${input.merchantId}`;
  }

  return `renew:${input.mode}:team-member:${input.merchantId}:${input.subjectRef}`;
}

function deriveStatusFromReview(
  review: SumsubReviewSnapshot,
  eventType?: string
): KycStatus {
  const reviewAnswer = review.reviewAnswer?.toUpperCase() ?? null;
  const reviewStatus = review.reviewStatus?.toLowerCase() ?? null;
  const normalizedEvent = eventType?.trim().toLowerCase() ?? "";

  if (reviewAnswer === "GREEN") {
    return "approved";
  }

  if (reviewAnswer === "RED") {
    return "rejected";
  }

  if (reviewStatus?.includes("hold") || normalizedEvent.includes("onhold")) {
    return "on_hold";
  }

  if (
    reviewStatus?.includes("pending") ||
    reviewStatus?.includes("init") ||
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

async function getTeamMemberOrThrow(teamMemberId: string, merchantId: string) {
  const teamMember = await TeamMemberModel.findById(teamMemberId).exec();

  if (!teamMember) {
    throw new HttpError(404, "Team member was not found.");
  }

  if (teamMember.merchantId.toString() !== merchantId) {
    throw new HttpError(403, "Team member does not belong to this merchant.");
  }

  return teamMember;
}

async function getOrCreateKycRecord(input: {
  merchantId: string;
  subjectType: KycSubjectType;
  subjectRef: string;
  levelName: string;
  actor: string;
  mode: RuntimeMode;
}) {
  const externalUserId = buildExternalUserId(input);
  let record = await KycCheckModel.findOne({
    merchantId: input.merchantId,
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    mode: input.mode,
  }).exec();

  if (!record) {
    record = await KycCheckModel.create({
      merchantId: input.merchantId,
      subjectType: input.subjectType,
      subjectRef: input.subjectRef,
      provider: "sumsub",
      mode: input.mode,
      externalUserId,
      levelName: input.levelName,
      status: "not_started",
      createdBy: input.actor,
    });
  } else if (record.levelName !== input.levelName) {
    record.levelName = input.levelName;
    await record.save();
  }

  return record;
}

function applyReviewSnapshot(input: {
  record: Awaited<ReturnType<typeof getOrCreateKycRecord>>;
  review: SumsubReviewSnapshot;
  eventType: string;
}) {
  const status = deriveStatusFromReview(input.review, input.eventType);
  const now = new Date();

  input.record.status = status;
  input.record.reviewStatus = input.review.reviewStatus;
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

function extractReviewFromWebhook(payload: SumsubWebhookInput): SumsubReviewSnapshot {
  const reviewResult =
    typeof payload.reviewResult === "object" && payload.reviewResult !== null
      ? payload.reviewResult
      : undefined;

  return {
    reviewStatus:
      toStringOrNull(payload.reviewStatus) ??
      toStringOrNull(payload["review.reviewStatus"]) ??
      null,
    reviewAnswer:
      toStringOrNull(reviewResult?.reviewAnswer) ??
      toStringOrNull(payload.reviewAnswer) ??
      null,
    rejectType:
      toStringOrNull(reviewResult?.reviewRejectType) ??
      toStringOrNull(payload.reviewRejectType) ??
      null,
    rejectLabels:
      toStringArray(reviewResult?.rejectLabels).length > 0
        ? toStringArray(reviewResult?.rejectLabels)
        : toStringArray(payload.rejectLabels),
    moderationComment:
      toStringOrNull(reviewResult?.moderationComment) ??
      toStringOrNull(payload.moderationComment) ??
      null,
    clientComment:
      toStringOrNull(reviewResult?.clientComment) ??
      toStringOrNull(payload.clientComment) ??
      null,
  };
}

function parseModeFromExternalUserId(value: string | null): RuntimeMode | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^renew:(test|live):/i);
  return match?.[1] === "live" ? "live" : match?.[1] === "test" ? "test" : null;
}

function createUnavailableKycResponse(input: {
  subjectType: KycSubjectType;
  subjectRef: string;
  mode: RuntimeMode;
  levelName: string;
  required?: boolean;
  available?: boolean;
  reason?: string | null;
}) {
  return {
    subjectType: input.subjectType,
    subjectRef: input.subjectRef,
    status: "not_started" as const,
    provider: "sumsub",
    mode: input.mode,
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
    levelName: input.levelName,
    metadata: {
      available: input.available ?? false,
      required: input.required ?? false,
      reason: input.reason ?? null,
    },
  };
}

function assertLiveOnboardingEnabled(action: string) {
  if (!liveOnboardingEnabled) {
    throw new HttpError(409, `${liveOnboardingDisabledMessage} Unable to continue ${action}.`);
  }
}

export async function getMerchantKybStatusByMerchantId(
  merchantId: string,
  mode: RuntimeMode = "test"
) {
  await getMerchantOrThrow(merchantId);
  if (mode !== "live") {
    return createUnavailableKycResponse({
      subjectType: "merchant",
      subjectRef: merchantId,
      mode,
      levelName: getSumsubConfig("live").levelNameKyb,
      reason: "Merchant KYB is only required in live mode.",
    });
  }

  const record = await KycCheckModel.findOne({
    merchantId,
    subjectType: "merchant",
    subjectRef: merchantId,
    mode,
  }).exec();

  if (!record) {
    return createUnavailableKycResponse({
      subjectType: "merchant",
      subjectRef: merchantId,
      mode,
      levelName: getSumsubConfig("live").levelNameKyb,
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

export async function getTeamMemberKycStatusById(input: {
  merchantId: string;
  teamMemberId: string;
  environment?: RuntimeMode;
}) {
  await getTeamMemberOrThrow(input.teamMemberId, input.merchantId);
  const mode = input.environment ?? "test";
  const record = await KycCheckModel.findOne({
    merchantId: input.merchantId,
    subjectType: "team_member",
    subjectRef: input.teamMemberId,
    mode,
  }).exec();

  if (!record) {
    return createUnavailableKycResponse({
      subjectType: "team_member",
      subjectRef: input.teamMemberId,
      mode,
      levelName: getSumsubConfig(mode).levelNameKyc,
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
  const mode = input.environment;
  if (mode !== "live") {
    throw new HttpError(409, "Merchant KYB is only required in live mode.");
  }
  assertLiveOnboardingEnabled("starting merchant KYB");
  const config = getSumsubConfig(mode);
  const sumsubProvider = getSumsubProvider(mode);
  const levelName = input.levelName ?? config.levelNameKyb;

  const record = await getOrCreateKycRecord({
    merchantId: input.merchantId,
    subjectType: "merchant",
    subjectRef: input.merchantId,
    levelName,
    actor: input.actor,
    mode,
  });

  if (!record.applicantId) {
    const applicant = await sumsubProvider.createApplicant({
      externalUserId: record.externalUserId,
      type: "company",
      levelName,
      companyInfo: {
        companyName: input.companyName ?? merchant.name,
        registrationNumber: input.registrationNumber,
        country: input.country,
        taxId: input.taxId,
      },
    });

    record.applicantId = applicant.applicantId;
    applyReviewSnapshot({
      record,
      review: applicant.review,
      eventType: "applicantCreated",
    });
  } else if (record.status === "not_started") {
    record.status = "pending";
  }

  const accessToken = await sumsubProvider.generateSdkAccessToken({
    externalUserId: record.externalUserId,
    levelName,
    ttlInSeconds: config.sdkTokenTtlSeconds,
    lang: input.lang,
  });

  record.lastSyncedAt = new Date();
  await record.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Started merchant KYB verification",
    category: "security",
    status: "ok",
    target: merchant.name,
    detail: "Merchant KYB verification was initiated via Sumsub.",
    metadata: {
      subjectType: record.subjectType,
      levelName: record.levelName,
      applicantId: record.applicantId,
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    kyc: toKycResponse(record),
    sdkAccessToken: accessToken.token,
    sdkAccessTokenExpiresAt: accessToken.expiresAt,
    userId: accessToken.userId,
  };
}

export async function startTeamMemberKycSession(input: StartTeamMemberKycInput) {
  const member = await getTeamMemberOrThrow(input.teamMemberId, input.merchantId);
  const mode = input.environment;
  if (mode === "live") {
    assertLiveOnboardingEnabled("starting team member KYC");
  }
  const config = getSumsubConfig(mode);
  const sumsubProvider = getSumsubProvider(mode);
  const levelName = input.levelName ?? config.levelNameKyc;
  const names = splitName(member.name);

  const record = await getOrCreateKycRecord({
    merchantId: input.merchantId,
    subjectType: "team_member",
    subjectRef: input.teamMemberId,
    levelName,
    actor: input.actor,
    mode,
  });

  if (!record.applicantId) {
    const applicant = await sumsubProvider.createApplicant({
      externalUserId: record.externalUserId,
      type: "individual",
      levelName,
      info: {
        firstName: names.firstName,
        lastName: names.lastName,
        country: input.country,
        email: member.email,
      },
    });

    record.applicantId = applicant.applicantId;
    applyReviewSnapshot({
      record,
      review: applicant.review,
      eventType: "applicantCreated",
    });
  } else if (record.status === "not_started") {
    record.status = "pending";
  }

  const accessToken = await sumsubProvider.generateSdkAccessToken({
    externalUserId: record.externalUserId,
    levelName,
    ttlInSeconds: config.sdkTokenTtlSeconds,
    lang: input.lang,
  });

  record.lastSyncedAt = new Date();
  await record.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Started team member KYC verification",
    category: "security",
    status: "ok",
    target: member.email,
    detail: "Team member KYC verification was initiated via Sumsub.",
    metadata: {
      teamMemberId: input.teamMemberId,
      levelName: record.levelName,
      applicantId: record.applicantId,
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    kyc: toKycResponse(record),
    sdkAccessToken: accessToken.token,
    sdkAccessTokenExpiresAt: accessToken.expiresAt,
    userId: accessToken.userId,
  };
}

export async function syncMerchantKybStatus(input: SyncMerchantKybInput) {
  await getMerchantOrThrow(input.merchantId);
  const mode = input.environment;
  if (mode !== "live") {
    throw new HttpError(409, "Merchant KYB is only required in live mode.");
  }
  assertLiveOnboardingEnabled("syncing merchant KYB");
  const sumsubProvider = getSumsubProvider(mode);
  const record = await KycCheckModel.findOne({
    merchantId: input.merchantId,
    subjectType: "merchant",
    subjectRef: input.merchantId,
    mode,
  }).exec();

  if (!record || !record.applicantId) {
    throw new HttpError(409, "Merchant KYB has not been started yet.");
  }

  const review = await sumsubProvider.getApplicantReview(record.applicantId);
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
    detail: "Merchant KYB status was refreshed from Sumsub.",
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

export async function syncTeamMemberKycStatus(input: SyncTeamMemberKycInput) {
  await getTeamMemberOrThrow(input.teamMemberId, input.merchantId);
  const mode = input.environment;
  if (mode === "live") {
    assertLiveOnboardingEnabled("syncing team member KYC");
  }
  const sumsubProvider = getSumsubProvider(mode);
  const record = await KycCheckModel.findOne({
    merchantId: input.merchantId,
    subjectType: "team_member",
    subjectRef: input.teamMemberId,
    mode,
  }).exec();

  if (!record || !record.applicantId) {
    throw new HttpError(409, "Team member KYC has not been started yet.");
  }

  const review = await sumsubProvider.getApplicantReview(record.applicantId);
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
    action: "Synced team member KYC status",
    category: "security",
    status: "ok",
    target: input.teamMemberId,
    detail: "Team member KYC status was refreshed from Sumsub.",
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

export async function processSumsubWebhook(input: {
  payload: SumsubWebhookInput;
  rawBody: string;
  digestHeader: string | null;
  digestAlgorithmHeader: string | null;
  environment?: RuntimeMode;
}) {
  const payloadMode =
    input.payload.environment ??
    parseModeFromExternalUserId(toStringOrNull(input.payload.externalUserId));
  const requestedMode = input.environment ?? payloadMode ?? "live";
  if (requestedMode === "live") {
    assertLiveOnboardingEnabled("processing Sumsub webhooks");
  }

  const mode: RuntimeMode = requestedMode;
  const config = getSumsubConfig(mode);
  const sumsubProvider = getSumsubProvider(mode);
  const hasConfiguredWebhookSecret = config.webhookSecret.length > 0;
  const digestMatches = sumsubProvider.verifyWebhookDigest({
    rawBody: input.rawBody,
    digest: input.digestHeader,
    algorithm: input.digestAlgorithmHeader,
  });

  if (hasConfiguredWebhookSecret && !digestMatches) {
    throw new HttpError(401, "Invalid Sumsub webhook digest.");
  }
  const eventType = toStringOrNull(input.payload.type) ?? "unknown";
  const eventKey = createHash("sha256").update(input.rawBody, "utf8").digest("hex");
  const existingEvent = await KycEventModel.findOne({
    provider: "sumsub",
    environment: mode,
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
        provider: "sumsub",
        environment: mode,
        eventKey,
        eventType,
        applicantId: toStringOrNull(input.payload.applicantId),
        externalUserId: toStringOrNull(input.payload.externalUserId),
        payload: input.payload,
      });
    } catch (error) {
      const maybeDuplicate = error as { code?: number };

      if (maybeDuplicate.code === 11000) {
        event = await KycEventModel.findOne({
          provider: "sumsub",
          environment: mode,
          eventKey,
        }).exec();
      } else {
        throw error;
      }
    }
  }

  if (!event) {
    throw new HttpError(500, "Unable to persist Sumsub webhook event.");
  }

  const applicantId = toStringOrNull(input.payload.applicantId);
  const externalUserId = toStringOrNull(input.payload.externalUserId);
  const record = applicantId
    ? await KycCheckModel.findOne({ applicantId, mode }).exec()
    : externalUserId
      ? await KycCheckModel.findOne({ externalUserId, mode }).exec()
      : null;

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
    actor: "sumsub-webhook",
    action: "Processed Sumsub verification webhook",
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
    environment: mode,
    subjectType: record.subjectType,
    status: record.status,
    reviewAnswer: record.reviewAnswer ?? null,
  }).catch((notificationError) => {
    console.error("[sumsub-webhook] Failed to queue verification notification:", notificationError);
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

export async function assertMerchantKybApprovedForLive(
  merchantId: string,
  action = "running this live operation",
  mode: RuntimeMode
) {
  if (mode !== "live") {
    return;
  }

  if (!liveOnboardingEnabled) {
    throw new HttpError(409, liveOnboardingDisabledMessage);
  }

  const record = await KycCheckModel.findOne({
    merchantId,
    subjectType: "merchant",
    subjectRef: merchantId,
    mode: "live",
  })
    .select({ status: 1 })
    .lean()
    .exec();

  if (!record || record.status !== "approved") {
    throw new HttpError(
      403,
      `Merchant KYB must be approved in live mode before ${action}.`
    );
  }
}
