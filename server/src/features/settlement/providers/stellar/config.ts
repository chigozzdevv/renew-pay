import { env } from "@/config/env.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getStellarSettlementConfig(mode: RuntimeMode) {
  const isLive = mode === "live";

  return {
    rpcUrl: isLive ? env.STELLAR_RPC_URL_LIVE : env.STELLAR_RPC_URL_TEST,
    networkPassphrase: isLive
      ? env.STELLAR_NETWORK_PASSPHRASE_LIVE
      : env.STELLAR_NETWORK_PASSPHRASE_TEST,
    vaultContractId: isLive
      ? env.STELLAR_SETTLEMENT_VAULT_CONTRACT_ID_LIVE
      : env.STELLAR_SETTLEMENT_VAULT_CONTRACT_ID_TEST,
    usdcContractId: isLive
      ? env.STELLAR_USDC_CONTRACT_ID_LIVE
      : env.STELLAR_USDC_CONTRACT_ID_TEST,
    operatorSecret: isLive
      ? env.STELLAR_SETTLEMENT_OPERATOR_SECRET_LIVE
      : env.STELLAR_SETTLEMENT_OPERATOR_SECRET_TEST,
  };
}
