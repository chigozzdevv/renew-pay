import { env } from "@/config/env.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getUmbraConfig(mode: RuntimeMode = env.PAYMENT_ENV) {
  const isLive = mode === "live";

  return {
    mode,
    network: isLive ? env.UMBRA_NETWORK_LIVE : env.UMBRA_NETWORK_TEST,
    rpcUrl: isLive ? env.SOLANA_RPC_URL_LIVE : env.SOLANA_RPC_URL_TEST,
    rpcSubscriptionsUrl: isLive
      ? env.SOLANA_RPC_SUBSCRIPTIONS_URL_LIVE
      : env.SOLANA_RPC_SUBSCRIPTIONS_URL_TEST,
    indexerApiEndpoint:
      (isLive
        ? env.UMBRA_INDEXER_API_URL_LIVE
        : env.UMBRA_INDEXER_API_URL_TEST
      ).trim() || undefined,
    settlementPrivateKey: isLive
      ? env.UMBRA_SETTLEMENT_PRIVATE_KEY_LIVE.trim()
      : env.UMBRA_SETTLEMENT_PRIVATE_KEY_TEST.trim(),
  };
}

export type UmbraRuntimeConfig = ReturnType<typeof getUmbraConfig>;
