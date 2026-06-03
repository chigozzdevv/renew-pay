import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export type StellarSettlementAsset = {
  symbol: "USDC";
  label: "Stellar USDC";
  decimals: 6;
  contractId: string | null;
};

export function getStellarSettlementAsset(
  environment: RuntimeMode
): StellarSettlementAsset {
  return {
    symbol: "USDC",
    label: "Stellar USDC",
    decimals: 6,
    contractId: null,
  };
}

export function listStellarSettlementAssets(environment: RuntimeMode) {
  return [getStellarSettlementAsset(environment)];
}
