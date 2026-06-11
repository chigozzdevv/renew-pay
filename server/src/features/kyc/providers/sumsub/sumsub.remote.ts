import { createHmac, timingSafeEqual } from "crypto";

import { getSumsubConfig } from "@/config/sumsub.config";
import type {
  CreateVerificationSessionInput,
  VerificationProvider,
  VerificationReviewSnapshot,
  VerificationSessionSummary,
  VerificationWebhookSignatureInput,
} from "@/features/kyc/providers/verification.types";
import { HttpError } from "@/shared/errors/http-error";

function toRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

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

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(secret: string, payload: string, algorithm = "sha256") {
  return createHmac(algorithm, secret).update(payload, "utf8").digest("hex");
}

function normalizeWebhookAlgorithm(value: string | null) {
  switch (value?.trim().toUpperCase()) {
    case "HMAC_SHA1_HEX":
      return "sha1";
    case "HMAC_SHA256_HEX":
      return "sha256";
    case "HMAC_SHA512_HEX":
      return "sha512";
    default:
      return null;
  }
}

function parseJsonObject(text: string) {
  if (!text) {
    return {};
  }

  try {
    return toRecord(JSON.parse(text));
  } catch {
    return {};
  }
}

function extractReviewSnapshot(payload: Record<string, unknown>): VerificationReviewSnapshot {
  const reviewResult = toRecord(payload.reviewResult);
  const reviewAnswer = toStringOrNull(reviewResult.reviewAnswer);
  const reviewRejectType = toStringOrNull(reviewResult.reviewRejectType);

  return {
    status: toStringOrNull(payload.reviewStatus),
    reviewAnswer,
    rejectType: reviewRejectType,
    rejectLabels: toStringArray(reviewResult.rejectLabels),
    moderationComment: toStringOrNull(reviewResult.moderationComment),
    clientComment: toStringOrNull(reviewResult.clientComment),
  };
}

function buildFixedInfo(input: CreateVerificationSessionInput) {
  const expected = input.expectedDetails ?? {};

  if (input.subjectType === "merchant") {
    return {
      companyInfo: {
        companyName: toStringOrNull(expected.company_name),
        registrationNumber: toStringOrNull(expected.registration_number),
        country: toStringOrNull(expected.country),
        taxId: toStringOrNull(expected.tax_id),
      },
    };
  }

  return {
    firstName: toStringOrNull(expected.first_name),
    lastName: toStringOrNull(expected.last_name),
    country: toStringOrNull(expected.id_country),
  };
}

export class SumsubRemoteProvider implements VerificationProvider {
  readonly name = "sumsub" as const;

  private readonly config: ReturnType<typeof getSumsubConfig>;

  constructor() {
    this.config = getSumsubConfig();
  }

  async createSession(input: CreateVerificationSessionInput) {
    const applicant = await this.getApplicantByExternalUserId(input.vendorData).catch(
      (error) => {
        if (error instanceof HttpError && error.statusCode === 404) {
          return null;
        }

        throw error;
      }
    );
    const applicantId =
      toStringOrNull(applicant?.id) ??
      toStringOrNull(applicant?.applicantId) ??
      (await this.createApplicant(input));
    const status = await this.getApplicantReviewStatus(applicantId).catch(() => null);
    const accessToken = await this.generateAccessToken(input);

    return {
      provider: this.name,
      sessionId: applicantId,
      sessionKind: input.subjectType === "merchant" ? "business" : "user",
      sessionToken: accessToken.token,
      url: "",
      vendorData: input.vendorData,
      levelName: input.levelName,
      review: status ? extractReviewSnapshot(status) : {
        status: "init",
        reviewAnswer: null,
        rejectType: null,
        rejectLabels: [],
        moderationComment: null,
        clientComment: null,
      },
      raw: {
        applicant,
        applicantId,
        accessToken: {
          issued: true,
          userId: accessToken.userId,
        },
        status,
      },
    } satisfies VerificationSessionSummary;
  }

  async getSessionDecision(sessionId: string) {
    const response = await this.getApplicantReviewStatus(sessionId);

    return {
      ...extractReviewSnapshot(response),
      raw: response,
    };
  }

  verifyWebhookSignature(input: VerificationWebhookSignatureInput) {
    if (!this.config.webhookSecret) {
      return true;
    }

    const digest = input.headers["x-payload-digest"];
    const digestAlg = input.headers["x-payload-digest-alg"];
    const algorithm = normalizeWebhookAlgorithm(digestAlg);

    if (!digest || !algorithm) {
      return false;
    }

    const expected = sign(this.config.webhookSecret, input.rawBody, algorithm);

    return safeCompare(expected, digest.trim());
  }

  private async createApplicant(input: CreateVerificationSessionInput) {
    const payload = {
      externalUserId: input.vendorData,
      type: input.subjectType === "merchant" ? "company" : "individual",
      email: input.contactDetails?.email,
      phone: input.contactDetails?.phone,
      lang: input.language,
      fixedInfo: buildFixedInfo(input),
      metadata: Object.entries(input.metadata ?? {}).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    };
    const response = await this.requestJson<Record<string, unknown>>(
      `/resources/applicants?levelName=${encodeURIComponent(input.levelName)}`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    const applicantId =
      toStringOrNull(response.id) ??
      toStringOrNull(response.applicantId) ??
      null;

    if (!applicantId) {
      throw new HttpError(502, "Verification applicant response is missing applicant id.");
    }

    return applicantId;
  }

  private async generateAccessToken(input: CreateVerificationSessionInput) {
    const payload = {
      userId: input.vendorData,
      levelName: input.levelName,
      ttlInSecs: 1800,
      applicantIdentifiers: {
        email: input.contactDetails?.email,
        phone: input.contactDetails?.phone,
      },
    };

    return this.requestJson<{ token?: string; userId?: string }>(
      "/resources/accessTokens/sdk",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ).then((response) => {
      const token = toStringOrNull(response.token);

      if (!token) {
        throw new HttpError(502, "Verification session response is missing token.");
      }

      return {
        token,
        userId: toStringOrNull(response.userId),
      };
    });
  }

  private getApplicantByExternalUserId(externalUserId: string) {
    return this.requestJson<Record<string, unknown>>(
      `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`
    );
  }

  private getApplicantReviewStatus(applicantId: string) {
    return this.requestJson<Record<string, unknown>>(
      `/resources/applicants/${encodeURIComponent(applicantId)}/status`
    );
  }

  private async requestJson<T>(
    path: string,
    options?: {
      method?: "GET" | "POST" | "PATCH";
      body?: string;
    }
  ) {
    if (!this.config.appToken || !this.config.secretKey) {
      throw new HttpError(500, "Verification credentials are missing.");
    }

    const method = options?.method ?? "GET";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = sign(
      this.config.secretKey,
      `${timestamp}${method}${path}${options?.body ?? ""}`
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/+$/, "")}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-App-Token": this.config.appToken,
          "X-App-Access-Sig": signature,
          "X-App-Access-Ts": timestamp,
        },
        body: options?.body,
        signal: controller.signal,
      });
      const text = await response.text();
      const json = parseJsonObject(text);

      if (!response.ok) {
        const message =
          toStringOrNull(json.description) ??
          toStringOrNull(json.message) ??
          text;

        throw new HttpError(
          response.status,
          `Verification request failed (${response.status}): ${message}`
        );
      }

      return json as T;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new HttpError(504, "Verification request timed out.");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
