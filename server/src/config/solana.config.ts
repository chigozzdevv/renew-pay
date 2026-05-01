import { env } from "@/config/env.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getSolanaSettlementConfig(mode: RuntimeMode = env.PAYMENT_ENV) {
  const isLive = mode === "live";

  return {
    mode,
    rpcUrl: isLive ? env.SOLANA_RPC_URL_LIVE : env.SOLANA_RPC_URL_TEST,
    settlementPrivateKey: isLive
      ? env.SOLANA_SETTLEMENT_PRIVATE_KEY_LIVE.trim()
      : env.SOLANA_SETTLEMENT_PRIVATE_KEY_TEST.trim(),
  };
}

export type SolanaSettlementConfig = ReturnType<typeof getSolanaSettlementConfig>;
