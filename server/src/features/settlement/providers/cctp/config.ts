import { env } from "@/config/env.config";
import { getStellarSettlementConfig } from "@/features/settlement/providers/stellar/config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getCctpSettlementConfig(mode: RuntimeMode) {
  const isLive = mode === "live";
  const stellarConfig = getStellarSettlementConfig(mode);

  return {
    environment: mode,
    sourceDomain: isLive
      ? env.CCTP_SOURCE_DOMAIN_LIVE
      : env.CCTP_SOURCE_DOMAIN_TEST,
    destinationDomain: isLive
      ? env.CCTP_DESTINATION_DOMAIN_LIVE
      : env.CCTP_DESTINATION_DOMAIN_TEST,
    irisApiUrl: isLive
      ? env.CIRCLE_IRIS_API_URL_LIVE
      : env.CIRCLE_IRIS_API_URL_TEST,
    solanaRpcUrl: isLive ? env.SOLANA_RPC_URL_LIVE : env.SOLANA_RPC_URL_TEST,
    collectionWallet: isLive ? env.COLLECTION_WALLET_LIVE : env.COLLECTION_WALLET_TEST,
    collectionPrivateKey: isLive
      ? env.COLLECTION_PRIVATE_KEY_LIVE
      : env.COLLECTION_PRIVATE_KEY_TEST,
    solanaUsdcMint: isLive
      ? env.CCTP_SOLANA_USDC_MINT_LIVE
      : env.CCTP_SOLANA_USDC_MINT_TEST,
    solanaTokenMessengerProgramId: isLive
      ? env.CCTP_SOLANA_TOKEN_MESSENGER_PROGRAM_ID_LIVE
      : env.CCTP_SOLANA_TOKEN_MESSENGER_PROGRAM_ID_TEST,
    solanaMessageTransmitterProgramId: isLive
      ? env.CCTP_SOLANA_MESSAGE_TRANSMITTER_PROGRAM_ID_LIVE
      : env.CCTP_SOLANA_MESSAGE_TRANSMITTER_PROGRAM_ID_TEST,
    stellarCctpForwarderContractId: isLive
      ? env.STELLAR_CCTP_FORWARDER_CONTRACT_ID_LIVE
      : env.STELLAR_CCTP_FORWARDER_CONTRACT_ID_TEST,
    stellarRpcUrl: stellarConfig.rpcUrl,
    stellarNetworkPassphrase: stellarConfig.networkPassphrase,
    stellarOperatorSecret: stellarConfig.operatorSecret,
    minFinalityThreshold: isLive
      ? env.CCTP_MIN_FINALITY_THRESHOLD_LIVE
      : env.CCTP_MIN_FINALITY_THRESHOLD_TEST,
    maxFeeUsdc: isLive ? env.CCTP_MAX_FEE_USDC_LIVE : env.CCTP_MAX_FEE_USDC_TEST,
    attestationPollIntervalMs: env.CCTP_ATTESTATION_POLL_INTERVAL_MS,
    attestationMaxAttempts: env.CCTP_ATTESTATION_MAX_ATTEMPTS,
  };
}
