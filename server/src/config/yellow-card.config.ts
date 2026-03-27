import { env } from "@/config/env.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getYellowCardConfig(mode: RuntimeMode = env.PAYMENT_ENV) {
  const isLive = mode === "live";
  const apiKey = (isLive ? env.YELLOW_CARD_API_KEY_LIVE : env.YELLOW_CARD_API_KEY_TEST).trim();
  const baseUrl = isLive ? env.YELLOW_CARD_BASE_URL_LIVE : env.YELLOW_CARD_BASE_URL_TEST;
  const webhookSecret = (
    isLive
      ? env.YELLOW_CARD_WEBHOOK_SECRET_LIVE
      : env.YELLOW_CARD_WEBHOOK_SECRET_TEST
  ).trim();

  return {
    mode,
    baseUrl,
    apiKey,
    timestampHeader: env.YELLOW_CARD_TIMESTAMP_HEADER,
    webhookSecret,
    timeoutMs: env.YELLOW_CARD_TIMEOUT_MS,
  };
}

export type YellowCardRuntimeConfig = ReturnType<typeof getYellowCardConfig>;
