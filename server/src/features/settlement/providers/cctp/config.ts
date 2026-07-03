import { env } from "@/config/env.config";
import { getAvalancheSettlementConfig } from "@/features/settlement/providers/avalanche/config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getCctpSettlementConfig(mode: RuntimeMode) {
  const isLive = mode === "live";
  const avalancheConfig = getAvalancheSettlementConfig(mode);

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
    collectionRpcUrl: isLive
      ? env.COLLECTION_RPC_URL_LIVE
      : env.COLLECTION_RPC_URL_TEST,
    collectionWallet: isLive ? env.COLLECTION_WALLET_LIVE : env.COLLECTION_WALLET_TEST,
    collectionPrivateKey: isLive
      ? env.COLLECTION_PRIVATE_KEY_LIVE
      : env.COLLECTION_PRIVATE_KEY_TEST,
    collectionAssetMint: isLive
      ? env.CCTP_COLLECTION_ASSET_MINT_LIVE
      : env.CCTP_COLLECTION_ASSET_MINT_TEST,
    collectionTokenMessengerProgramId: isLive
      ? env.CCTP_COLLECTION_TOKEN_MESSENGER_PROGRAM_ID_LIVE
      : env.CCTP_COLLECTION_TOKEN_MESSENGER_PROGRAM_ID_TEST,
    collectionMessageTransmitterProgramId: isLive
      ? env.CCTP_COLLECTION_MESSAGE_TRANSMITTER_PROGRAM_ID_LIVE
      : env.CCTP_COLLECTION_MESSAGE_TRANSMITTER_PROGRAM_ID_TEST,
    avalancheRpcUrl: avalancheConfig.rpcUrl,
    avalancheChainId: avalancheConfig.chainId,
    avalancheUsdcContractAddress: avalancheConfig.usdcContractAddress,
    avalancheVaultContractAddress: avalancheConfig.vaultContractAddress,
    avalancheOperatorPrivateKey: avalancheConfig.operatorPrivateKey,
    avalancheCctpTokenMessengerAddress: avalancheConfig.cctpTokenMessengerAddress,
    avalancheCctpMessageTransmitterAddress:
      avalancheConfig.cctpMessageTransmitterAddress,
    minFinalityThreshold: isLive
      ? env.CCTP_MIN_FINALITY_THRESHOLD_LIVE
      : env.CCTP_MIN_FINALITY_THRESHOLD_TEST,
    maxFeeUsdc: isLive ? env.CCTP_MAX_FEE_USDC_LIVE : env.CCTP_MAX_FEE_USDC_TEST,
    attestationPollIntervalMs: env.CCTP_ATTESTATION_POLL_INTERVAL_MS,
    attestationMaxAttempts: env.CCTP_ATTESTATION_MAX_ATTEMPTS,
  };
}
