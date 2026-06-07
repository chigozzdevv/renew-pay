import { createHmac, timingSafeEqual } from "crypto";

import { getDiditConfig } from "@/config/didit.config";
import type {
  CreateDiditSessionInput,
  DiditProvider,
  DiditReviewSnapshot,
  DiditSessionKind,
  DiditSessionSummary,
  DiditWebhookSignatureInput,
} from "@/features/kyc/providers/didit/didit.types";
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

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (typeof value === "object" && value !== null) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortKeys((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function isFreshTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return false;
  }

  const value = Number.parseInt(timestamp, 10);

  if (!Number.isFinite(value)) {
    return false;
  }

  return Math.abs(Math.floor(Date.now() / 1000) - value) <= 300;
}

function extractReviewSnapshot(payload: Record<string, unknown>): DiditReviewSnapshot {
  const decision = toRecord(payload.decision);
  const reviews = Array.isArray(decision.reviews) ? decision.reviews : [];
  const latestReview = toRecord(reviews.at(-1));
  const status =
    toStringOrNull(payload.status) ??
    toStringOrNull(decision.status) ??
    toStringOrNull(latestReview.new_status);
  const resubmitInfo = toRecord(payload.resubmit_info);
  const resubmitReasons = toRecord(resubmitInfo.reasons);
  const rejectLabels = [
    ...toStringArray(payload.rejectLabels),
    ...Object.keys(resubmitReasons),
  ];

  return {
    status,
    reviewAnswer: status,
    rejectType: toStringOrNull(payload.previous_status) ?? null,
    rejectLabels: [...new Set(rejectLabels)],
    moderationComment:
      toStringOrNull(latestReview.comment) ??
      toStringOrNull(payload.comment) ??
      null,
    clientComment:
      toStringOrNull(resubmitReasons[Object.keys(resubmitReasons)[0]]) ??
      toStringOrNull(payload.reason) ??
      null,
  };
}

export class DiditRemoteProvider implements DiditProvider {
  private readonly config: ReturnType<typeof getDiditConfig>;

  constructor() {
    this.config = getDiditConfig();
  }

  async createSession(input: CreateDiditSessionInput) {
    const payload = {
      workflow_id: input.workflowId,
      vendor_data: input.vendorData,
      callback: input.callback,
      callback_method: "both",
      ...(input.language ? { language: input.language } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.contactDetails
        ? {
            contact_details: {
              ...input.contactDetails,
              send_notification_emails: false,
              email_lang: input.language ?? "en",
            },
          }
        : {}),
      ...(input.expectedDetails ? { expected_details: input.expectedDetails } : {}),
    };
    const response = await this.requestJson<Record<string, unknown>>("/v3/session/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const sessionId =
      toStringOrNull(response.session_id) ??
      toStringOrNull(response.id) ??
      null;
    const url = toStringOrNull(response.url) ?? toStringOrNull(response.session_url);

    if (!sessionId) {
      throw new HttpError(502, "Verification session response is missing session id.");
    }

    if (!url) {
      throw new HttpError(502, "Verification session response is missing url.");
    }

    return {
      sessionId,
      sessionKind:
        response.session_kind === "user" || response.session_kind === "business"
          ? (response.session_kind as DiditSessionKind)
          : null,
      sessionToken: toStringOrNull(response.session_token),
      url,
      vendorData: toStringOrNull(response.vendor_data) ?? input.vendorData,
      workflowId: toStringOrNull(response.workflow_id) ?? input.workflowId,
      review: extractReviewSnapshot(response),
      raw: response,
    } satisfies DiditSessionSummary;
  }

  async getSessionDecision(sessionId: string) {
    const response = await this.requestJson<Record<string, unknown>>(
      `/v3/session/${encodeURIComponent(sessionId)}/decision/`,
      { method: "GET" }
    );

    return {
      ...extractReviewSnapshot(response),
      raw: response,
    };
  }

  verifyWebhookSignature(input: DiditWebhookSignatureInput) {
    if (!this.config.webhookSecret) {
      return true;
    }

    if (!isFreshTimestamp(input.timestamp)) {
      return false;
    }

    if (input.signatureV2) {
      const canonical = JSON.stringify(sortKeys(input.payload));
      const expected = sign(this.config.webhookSecret, canonical);

      if (safeCompare(expected, input.signatureV2.trim())) {
        return true;
      }
    }

    if (input.signature) {
      const expected = sign(this.config.webhookSecret, input.rawBody);

      if (safeCompare(expected, input.signature.trim())) {
        return true;
      }
    }

    if (input.signatureSimple) {
      const canonical = [
        input.payload.timestamp ?? "",
        input.payload.session_id ?? "",
        input.payload.status ?? "",
        input.payload.webhook_type ?? "",
      ].join(":");
      const expected = sign(this.config.webhookSecret, canonical);

      return safeCompare(expected, input.signatureSimple.trim());
    }

    return false;
  }

  private async requestJson<T>(
    path: string,
    options?: {
      method?: "GET" | "POST";
      body?: string;
    }
  ) {
    if (!this.config.apiKey) {
      throw new HttpError(500, "Verification credentials are missing.");
    }

    const method = options?.method ?? "GET";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
        },
        body: method === "POST" ? options?.body : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new HttpError(
          response.status,
          `Verification request failed (${response.status}): ${message}`
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
