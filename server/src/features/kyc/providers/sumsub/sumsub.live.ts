import { createHmac, timingSafeEqual } from "crypto";

import { getSumsubConfig } from "@/config/sumsub.config";
import type {
  CreateSumsubAccessTokenInput,
  CreateSumsubApplicantInput,
  SumsubAccessTokenResult,
  SumsubApplicantSummary,
  SumsubProvider,
  SumsubReviewSnapshot,
  SumsubWebhookDigestInput,
} from "@/features/kyc/providers/sumsub/sumsub.types";
import { HttpError } from "@/shared/errors/http-error";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

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

function extractReviewSnapshot(payload: Record<string, unknown>): SumsubReviewSnapshot {
  const review =
    typeof payload.review === "object" && payload.review !== null
      ? (payload.review as Record<string, unknown>)
      : null;
  const reviewResult =
    review && typeof review.reviewResult === "object" && review.reviewResult !== null
      ? (review.reviewResult as Record<string, unknown>)
      : null;

  return {
    reviewStatus:
      toStringOrNull(review?.reviewStatus) ??
      toStringOrNull(payload.reviewStatus) ??
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

function safeCompareHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export class SumsubLiveProvider implements SumsubProvider {
  private readonly config: ReturnType<typeof getSumsubConfig>;

  constructor(mode: RuntimeMode = "live") {
    this.config = getSumsubConfig(mode);
  }

  async createApplicant(input: CreateSumsubApplicantInput) {
    const payload: Record<string, unknown> = {
      externalUserId: input.externalUserId,
      type: input.type,
    };

    if (input.type === "company") {
      payload.companyInfo = {
        companyName: input.companyInfo?.companyName,
        registrationNumber: input.companyInfo?.registrationNumber,
        country: input.companyInfo?.country,
        taxId: input.companyInfo?.taxId,
      };
    } else {
      payload.info = {
        firstName: input.info?.firstName,
        lastName: input.info?.lastName,
        country: input.info?.country,
        email: input.info?.email,
      };
    }

    const body = JSON.stringify(payload);
    const path = `/resources/applicants?levelName=${encodeURIComponent(
      input.levelName
    )}`;
    const response = await this.requestJson<Record<string, unknown>>(path, {
      method: "POST",
      body,
    });

    const applicantId =
      toStringOrNull(response.id) ??
      toStringOrNull(response.applicantId) ??
      null;

    if (!applicantId) {
      throw new HttpError(502, "Sumsub applicant response is missing id.");
    }

    return {
      applicantId,
      externalUserId:
        toStringOrNull(response.externalUserId) ?? input.externalUserId,
      type: input.type,
      review: extractReviewSnapshot(response),
      raw: response,
    } satisfies SumsubApplicantSummary;
  }

  async generateSdkAccessToken(input: CreateSumsubAccessTokenInput) {
    const path = "/resources/accessTokens/sdk";
    const body = JSON.stringify({
      userId: input.externalUserId,
      levelName: input.levelName,
      ttlInSecs: input.ttlInSeconds,
      ...(input.lang ? { lang: input.lang } : {}),
    });
    const response = await this.requestJson<Record<string, unknown>>(path, {
      method: "POST",
      body,
    });

    const token =
      toStringOrNull(response.token) ??
      toStringOrNull(response.accessToken) ??
      null;

    if (!token) {
      throw new HttpError(502, "Sumsub SDK access token response is missing token.");
    }

    return {
      token,
      userId: toStringOrNull(response.userId) ?? input.externalUserId,
      expiresAt:
        toStringOrNull(response.expiresAt) ??
        toStringOrNull(response.expiredAt) ??
        null,
      raw: response,
    } satisfies SumsubAccessTokenResult;
  }

  async getApplicantReview(applicantId: string) {
    const path = `/resources/applicants/${encodeURIComponent(
      applicantId
    )}/requiredIdDocsStatus`;
    const response = await this.requestJson<Record<string, unknown>>(path, {
      method: "GET",
    });

    return {
      ...extractReviewSnapshot(response),
      raw: response,
    };
  }

  verifyWebhookDigest(input: SumsubWebhookDigestInput) {
    if (!this.config.webhookSecret) {
      return true;
    }

    if (!input.digest) {
      return false;
    }

    const algorithm = (input.algorithm ?? "HMAC_SHA256_HEX")
      .trim()
      .toUpperCase();
    const digestAlgorithm =
      algorithm === "HMAC_SHA1_HEX"
        ? "sha1"
        : algorithm === "HMAC_SHA512_HEX"
          ? "sha512"
          : algorithm === "HMAC_SHA256_HEX"
            ? "sha256"
            : null;

    if (!digestAlgorithm) {
      return false;
    }

    const expected = createHmac(digestAlgorithm, this.config.webhookSecret)
      .update(input.rawBody, "utf8")
      .digest("hex");
    const received = input.digest.trim().toLowerCase();

    return safeCompareHex(expected, received);
  }

  private async requestJson<T>(
    path: string,
    options?: {
      method?: "GET" | "POST";
      body?: string;
    }
  ) {
    if (!this.config.appToken || !this.config.secretKey) {
      throw new HttpError(
        500,
        "Sumsub credentials are missing for this provider configuration."
      );
    }

    const method = options?.method ?? "GET";
    const body = options?.body ?? "";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signaturePayload = `${timestamp}${method}${path}${body}`;
    const signature = createHmac("sha256", this.config.secretKey)
      .update(signaturePayload)
      .digest("hex");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-App-Token": this.config.appToken,
          "X-App-Access-Ts": timestamp,
          "X-App-Access-Sig": signature,
        },
        body: method === "POST" ? body : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new HttpError(
          response.status,
          `Sumsub request failed (${response.status}): ${message}`
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
