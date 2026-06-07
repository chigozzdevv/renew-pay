import { env } from "@/config/env.config";

export function getDiditConfig() {
  return {
    enabled: env.VERIFICATION_ONBOARDING_ENABLED,
    baseUrl: env.DIDIT_BASE_URL,
    apiKey: env.DIDIT_API_KEY.trim(),
    webhookSecret: env.DIDIT_WEBHOOK_SECRET.trim(),
    workflowIdKyc: env.DIDIT_WORKFLOW_ID_KYC,
    workflowIdKyb: env.DIDIT_WORKFLOW_ID_KYB,
    timeoutMs: env.DIDIT_TIMEOUT_MS,
    callbackUrl: env.APP_BASE_URL,
  };
}

export type DiditRuntimeConfig = ReturnType<typeof getDiditConfig>;
