import { env } from "@/config/env.config";

export type VerificationProviderName = "didit" | "sumsub";

export function getVerificationConfig() {
  return {
    enabled: env.VERIFICATION_ONBOARDING_ENABLED,
    provider: env.VERIFICATION_PROVIDER,
    callbackUrl: env.APP_BASE_URL,
  };
}
