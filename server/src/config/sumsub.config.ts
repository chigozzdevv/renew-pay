import { env } from "@/config/env.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getSumsubConfig(mode: RuntimeMode = env.PAYMENT_ENV) {
  const isLive = mode === "live";

  return {
    mode,
    baseUrl: isLive ? env.SUMSUB_BASE_URL_LIVE : env.SUMSUB_BASE_URL_TEST,
    appToken: (isLive ? env.SUMSUB_APP_TOKEN_LIVE : env.SUMSUB_APP_TOKEN_TEST).trim(),
    secretKey: (isLive ? env.SUMSUB_SECRET_KEY_LIVE : env.SUMSUB_SECRET_KEY_TEST).trim(),
    webhookSecret: (
      isLive ? env.SUMSUB_WEBHOOK_SECRET_LIVE : env.SUMSUB_WEBHOOK_SECRET_TEST
    ).trim(),
    sdkTokenTtlSeconds: env.SUMSUB_SDK_TOKEN_TTL_SECONDS,
    timeoutMs: env.SUMSUB_TIMEOUT_MS,
    levelNameKyc: isLive ? env.SUMSUB_LEVEL_NAME_KYC_LIVE : env.SUMSUB_LEVEL_NAME_KYC_TEST,
    levelNameKyb: isLive ? env.SUMSUB_LEVEL_NAME_KYB_LIVE : env.SUMSUB_LEVEL_NAME_KYB_TEST,
  };
}

export type SumsubRuntimeConfig = ReturnType<typeof getSumsubConfig>;
