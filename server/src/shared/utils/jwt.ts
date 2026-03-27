import { createHmac, timingSafeEqual } from "crypto";

import { HttpError } from "@/shared/errors/http-error";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JwtPayload = {
  [key: string]: JsonValue | undefined;
  iat?: number;
  exp?: number;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
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

  return Buffer.from(padded, "base64").toString("utf8");
}

function signSegment(segment: string, secret: string) {
  return base64UrlEncode(createHmac("sha256", secret).update(segment).digest());
}

export function signJwt(
  payload: JwtPayload,
  options: { secret: string; expiresInSeconds: number }
) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const tokenPayload: JwtPayload = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + options.expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signSegment(signingInput, options.secret);

  return `${signingInput}.${signature}`;
}

export function verifyJwt(token: string, secret: string) {
  const [headerPart, payloadPart, signaturePart] = token.split(".");

  if (!headerPart || !payloadPart || !signaturePart) {
    throw new HttpError(401, "Invalid authentication token format.");
  }

  const signingInput = `${headerPart}.${payloadPart}`;
  const expectedSignature = signSegment(signingInput, secret);
  const providedSignatureBuffer = Buffer.from(signaturePart, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedSignatureBuffer.length !== expectedSignatureBuffer.length) {
    throw new HttpError(401, "Invalid authentication token signature.");
  }

  if (!timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)) {
    throw new HttpError(401, "Invalid authentication token signature.");
  }

  let payload: JwtPayload;

  try {
    payload = JSON.parse(base64UrlDecode(payloadPart)) as JwtPayload;
  } catch {
    throw new HttpError(401, "Invalid authentication token payload.");
  }

  if (typeof payload.exp !== "number") {
    throw new HttpError(401, "Authentication token is missing expiry.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (payload.exp <= nowSeconds) {
    throw new HttpError(401, "Authentication token expired.");
  }

  return payload;
}
