import { env } from "@/config/env.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getAvalancheSettlementConfig(mode: RuntimeMode) {
  const isLive = mode === "live";

  return {
    rpcUrl: isLive ? env.AVALANCHE_RPC_URL_LIVE : env.AVALANCHE_RPC_URL_TEST,
    chainId: isLive ? env.AVALANCHE_CHAIN_ID_LIVE : env.AVALANCHE_CHAIN_ID_TEST,
    usdcContractAddress: isLive
      ? env.AVALANCHE_USDC_CONTRACT_ADDRESS_LIVE
      : env.AVALANCHE_USDC_CONTRACT_ADDRESS_TEST,
    vaultContractAddress: isLive
      ? env.AVALANCHE_SETTLEMENT_VAULT_ADDRESS_LIVE
      : env.AVALANCHE_SETTLEMENT_VAULT_ADDRESS_TEST,
    operatorPrivateKey: isLive
      ? env.AVALANCHE_SETTLEMENT_OPERATOR_PRIVATE_KEY_LIVE
      : env.AVALANCHE_SETTLEMENT_OPERATOR_PRIVATE_KEY_TEST,
    cctpTokenMessengerAddress: isLive
      ? env.AVALANCHE_CCTP_TOKEN_MESSENGER_ADDRESS_LIVE
      : env.AVALANCHE_CCTP_TOKEN_MESSENGER_ADDRESS_TEST,
    cctpMessageTransmitterAddress: isLive
      ? env.AVALANCHE_CCTP_MESSAGE_TRANSMITTER_ADDRESS_LIVE
      : env.AVALANCHE_CCTP_MESSAGE_TRANSMITTER_ADDRESS_TEST,
  };
}
