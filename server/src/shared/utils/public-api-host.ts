import type { Request } from "express";

import type { RuntimeMode } from "@/shared/constants/runtime-mode";

const publicApiHostToRuntimeMode: Readonly<Record<string, RuntimeMode>> = {
  "api.renew.sh": "live",
  "sandbox.renew.sh": "test",
};

export function normalizeRequestHost(value: string) {
  return value
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/:\d+$/, "");
}

export function inferPublicApiRuntimeModeFromHost(
  host: string | null | undefined
): RuntimeMode | null {
  if (!host?.trim()) {
    return null;
  }

  return publicApiHostToRuntimeMode[normalizeRequestHost(host)] ?? null;
}

export function getPublicApiHostForRuntimeMode(mode: RuntimeMode) {
  return mode === "live" ? "api.renew.sh" : "sandbox.renew.sh";
}

export function resolveRequestPublicApiRuntimeMode(request: Request) {
  const forwardedHost = request.header("x-forwarded-host");

  if (forwardedHost?.trim()) {
    return inferPublicApiRuntimeModeFromHost(forwardedHost);
  }

  return inferPublicApiRuntimeModeFromHost(request.header("host"));
}
