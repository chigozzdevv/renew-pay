import { env } from "@/config/env.config";

export function getSumsubConfig() {
  return {
    baseUrl: env.SUMSUB_BASE_URL,
    appToken: env.SUMSUB_APP_TOKEN.trim(),
    secretKey: env.SUMSUB_SECRET_KEY.trim(),
    webhookSecret: env.SUMSUB_WEBHOOK_SECRET.trim(),
    levelNameKyc: env.SUMSUB_LEVEL_NAME_KYC,
    levelNameKyb: env.SUMSUB_LEVEL_NAME_KYB,
    timeoutMs: env.SUMSUB_TIMEOUT_MS,
  };
}

export type SumsubRuntimeConfig = ReturnType<typeof getSumsubConfig>;

