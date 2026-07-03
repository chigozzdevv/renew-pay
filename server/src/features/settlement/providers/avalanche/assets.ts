import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { getAvalancheSettlementConfig } from "@/features/settlement/providers/avalanche/config";

export type AvalancheSettlementAsset = {
  symbol: "USDC";
  label: "Avalanche USDC";
  decimals: 6;
  contractAddress: string | null;
};

export function getAvalancheSettlementAsset(
  environment: RuntimeMode
): AvalancheSettlementAsset {
  const config = getAvalancheSettlementConfig(environment);

  return {
    symbol: "USDC",
    label: "Avalanche USDC",
    decimals: 6,
    contractAddress: config.usdcContractAddress || null,
  };
}

export function listAvalancheSettlementAssets(environment: RuntimeMode) {
  return [getAvalancheSettlementAsset(environment)];
}
