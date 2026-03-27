import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = "sha512";

export function createPasswordHash(password: string, iterations: number) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(
    password,
    salt,
    iterations,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST
  ).toString("hex");

  return {
    salt,
    hash,
  };
}

export function verifyPasswordHash(input: {
  password: string;
  salt: string;
  expectedHash: string;
  iterations: number;
}) {
  const actualHash = pbkdf2Sync(
    input.password,
    input.salt,
    input.iterations,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST
  ).toString("hex");

  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(input.expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
