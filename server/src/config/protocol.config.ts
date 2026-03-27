import { env } from "@/config/env.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getProtocolRuntimeConfig(mode: RuntimeMode = env.PAYMENT_ENV) {
  const isLive = mode === "live";

  return {
    mode,
    network: "solana",
    cluster: isLive ? env.SOLANA_CLUSTER_LIVE : env.SOLANA_CLUSTER_TEST,
    rpcUrl: isLive ? env.SOLANA_RPC_URL_LIVE : env.SOLANA_RPC_URL_TEST,
    wsUrl: isLive ? env.SOLANA_WS_URL_LIVE : env.SOLANA_WS_URL_TEST,
    programId: isLive ? env.RENEW_PROGRAM_ID_LIVE : env.RENEW_PROGRAM_ID_TEST,
    settlementMintAddress: isLive
      ? env.RENEW_SETTLEMENT_MINT_LIVE
      : env.RENEW_SETTLEMENT_MINT_TEST,
    explorerBaseUrl: isLive
      ? env.SOLANA_EXPLORER_BASE_URL_LIVE
      : env.SOLANA_EXPLORER_BASE_URL_TEST,
  };
}
