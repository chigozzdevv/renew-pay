import { env } from "@/config/env.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getPartnaConfig(mode: RuntimeMode = env.PAYMENT_ENV) {
  const isLive = mode === "live";

  return {
    mode,
    apiKey: (isLive ? env.PARTNA_API_KEY_LIVE : env.PARTNA_API_KEY_TEST).trim(),
    apiUser: (isLive ? env.PARTNA_API_USER_LIVE : env.PARTNA_API_USER_TEST).trim(),
    v4BaseUrl: (
      isLive ? env.PARTNA_V4_BASE_URL_LIVE : env.PARTNA_V4_BASE_URL_TEST
    ).trim(),
    vouchersBaseUrl: (
      isLive ? env.PARTNA_VOUCHERS_BASE_URL_LIVE : env.PARTNA_VOUCHERS_BASE_URL_TEST
    ).trim(),
    timeoutMs: env.PARTNA_TIMEOUT_MS,
    webhookPublicKey: (
      isLive ? env.PARTNA_WEBHOOK_PUBLIC_KEY_LIVE : env.PARTNA_WEBHOOK_PUBLIC_KEY_TEST
    ).trim(),
  };
}

export type PartnaRuntimeConfig = ReturnType<typeof getPartnaConfig>;
