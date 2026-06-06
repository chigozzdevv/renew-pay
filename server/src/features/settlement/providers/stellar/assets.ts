import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { getStellarSettlementConfig } from "@/features/settlement/providers/stellar/config";

export type StellarSettlementAsset = {
  symbol: "USDC";
  label: "Stellar USDC";
  decimals: 7;
  contractId: string | null;
};

export function getStellarSettlementAsset(
  environment: RuntimeMode
): StellarSettlementAsset {
  const config = getStellarSettlementConfig(environment);

  return {
    symbol: "USDC",
    label: "Stellar USDC",
    decimals: 7,
    contractId: config.usdcContractId || null,
  };
}

export function listStellarSettlementAssets(environment: RuntimeMode) {
  return [getStellarSettlementAsset(environment)];
}
