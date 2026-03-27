import { getProtocolRuntimeConfig } from "@/config/protocol.config";

export function getProtocolStatus() {
  const config = getProtocolRuntimeConfig();

  return {
    network: "solana",
    cluster: config.cluster,
    settlementAsset: "USDC",
    config,
  };
}
