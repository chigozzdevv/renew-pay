import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";

import { env } from "@/config/env.config";

const webhookSignatureHeaderNames = {
  signature: "x-renew-signature",
  timestamp: "x-renew-timestamp",
} as const;

function base64UrlEncode(value: Buffer) {
  return value
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  const padded =
    remainder === 0 ? normalized : `${normalized}${"=".repeat(4 - remainder)}`;

  return Buffer.from(padded, "base64");
}

function getWebhookEncryptionKey() {
  return createHash("sha256")
    .update(env.DEVELOPER_WEBHOOK_SECRET_ENCRYPTION_KEY)
    .digest();
}

function createSignedPayload(timestamp: number, payload: string) {
  return `${timestamp}.${payload}`;
}

export function createWebhookSecret() {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function encryptWebhookSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getWebhookEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map(base64UrlEncode).join(".");
}

export function decryptWebhookSecret(payload: string) {
  const [ivPart, authTagPart, ciphertextPart] = payload.split(".");

  if (!ivPart || !authTagPart || !ciphertextPart) {
    throw new Error("Stored webhook secret is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getWebhookEncryptionKey(),
    base64UrlDecode(ivPart)
  );
  decipher.setAuthTag(base64UrlDecode(authTagPart));

  const plaintext = Buffer.concat([
    decipher.update(base64UrlDecode(ciphertextPart)),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function signDeveloperWebhookPayload(input: {
  payload: string;
  signingSecret: string;
  timestamp?: number;
}) {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const digest = createHmac(
    "sha256",
    input.signingSecret
  )
    .update(createSignedPayload(timestamp, input.payload))
    .digest("hex");

  return {
    timestamp,
    signature: digest,
    headers: {
      [webhookSignatureHeaderNames.timestamp]: String(timestamp),
      [webhookSignatureHeaderNames.signature]: `v1=${digest}`,
    },
  };
}

export { webhookSignatureHeaderNames };
