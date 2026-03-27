import type { RenewEnvironment } from "../types/checkout.js";

type RenewApiConfig = {
  readonly apiOrigin?: string;
  readonly environment?: RenewEnvironment;
};

function normalizeApiOrigin(value: string) {
  return value.replace(/\/+$/, "").replace(/\/v1$/, "");
}

export function getRenewApiOrigin(environment: RenewEnvironment) {
  return environment === "live"
    ? "https://api.renew.sh"
    : "https://sandbox.renew.sh";
}

export function inferRenewEnvironmentFromSecretKey(secretKey: string): RenewEnvironment {
  const normalized = secretKey.trim();

  if (normalized.startsWith("rw_live_")) {
    return "live";
  }

  if (normalized.startsWith("rw_test_")) {
    return "sandbox";
  }

  throw new Error("Renew server key must start with rw_test_ or rw_live_.");
}

export function inferRenewEnvironmentFromApiOrigin(
  apiOrigin: string
): RenewEnvironment | null {
  const normalized = normalizeApiOrigin(apiOrigin);

  if (normalized === "https://api.renew.sh") {
    return "live";
  }

  if (normalized === "https://sandbox.renew.sh") {
    return "sandbox";
  }

  return null;
}

export function resolveRenewApiOrigin(config: RenewApiConfig) {
  if (config.apiOrigin?.trim()) {
    return normalizeApiOrigin(config.apiOrigin);
  }

  if (config.environment) {
    return getRenewApiOrigin(config.environment);
  }

  throw new Error(
    "Renew SDK requires either apiOrigin or environment."
  );
}

export function validateRenewApiEnvironment(input: {
  readonly apiOrigin: string;
  readonly environment?: RenewEnvironment;
  readonly secretKey?: string;
}) {
  const configuredEnvironment =
    input.environment ??
    (input.secretKey ? inferRenewEnvironmentFromSecretKey(input.secretKey) : undefined);
  const inferredFromOrigin = inferRenewEnvironmentFromApiOrigin(input.apiOrigin);

  if (
    configuredEnvironment &&
    inferredFromOrigin &&
    configuredEnvironment !== inferredFromOrigin
  ) {
    throw new Error(
      `Renew API origin ${input.apiOrigin} does not match ${configuredEnvironment} mode.`
    );
  }

  return configuredEnvironment;
}
