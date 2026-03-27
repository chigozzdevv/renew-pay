import { createHmac, timingSafeEqual } from "crypto";

export const renewWebhookHeaderNames = {
  signature: "x-renew-signature",
  timestamp: "x-renew-timestamp",
} as const;

type SignRenewWebhookPayloadInput = {
  readonly payload: string;
  readonly signingSecret: string;
  readonly timestamp?: number;
};

type VerifyRenewWebhookSignatureInput = {
  readonly payload: string;
  readonly signingSecret: string;
  readonly signatureHeader: string | null | undefined;
  readonly timestampHeader: string | null | undefined;
  readonly toleranceSeconds?: number;
  readonly now?: number;
};

function createSignedPayload(value: { timestamp: number; payload: string }) {
  return `${value.timestamp}.${value.payload}`;
}

function parseSignatureHeader(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split(",");
  const versionSegment = segments.find((segment) => segment.trim().startsWith("v1="));
  const candidate = versionSegment ?? trimmed;
  const [, signature] = candidate.split("=");

  return (signature ?? candidate).trim() || null;
}

export function signRenewWebhookPayload(input: SignRenewWebhookPayloadInput) {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const payload = createSignedPayload({
    timestamp,
    payload: input.payload,
  });
  const digest = createHmac("sha256", input.signingSecret)
    .update(payload)
    .digest("hex");

  return {
    timestamp,
    signature: digest,
    headers: {
      [renewWebhookHeaderNames.timestamp]: String(timestamp),
      [renewWebhookHeaderNames.signature]: `v1=${digest}`,
    },
  };
}

export function verifyRenewWebhookSignature(
  input: VerifyRenewWebhookSignatureInput
) {
  const signature = parseSignatureHeader(input.signatureHeader);
  const timestamp = Number.parseInt(input.timestampHeader ?? "", 10);

  if (!signature || Number.isNaN(timestamp)) {
    return false;
  }

  const now = input.now ?? Math.floor(Date.now() / 1000);
  const toleranceSeconds = input.toleranceSeconds ?? 300;

  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = signRenewWebhookPayload({
    payload: input.payload,
    signingSecret: input.signingSecret,
    timestamp,
  }).signature;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function createRenewSecretKeyHeaders(secretKey: string) {
  return {
    "x-renew-secret-key": secretKey,
  };
}
