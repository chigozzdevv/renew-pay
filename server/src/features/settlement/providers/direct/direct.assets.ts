export const directSolanaSettlementAssets = {
  USDC: {
    symbol: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
  },
} as const;

export type DirectSolanaSettlementAssetSymbol =
  keyof typeof directSolanaSettlementAssets;
export type DirectSolanaSettlementAsset =
  (typeof directSolanaSettlementAssets)[DirectSolanaSettlementAssetSymbol];

export function getDirectSolanaSettlementAsset(
  assetSymbol: string
): DirectSolanaSettlementAsset | null {
  const normalized = assetSymbol.trim().toUpperCase();

  if (
    !Object.prototype.hasOwnProperty.call(
      directSolanaSettlementAssets,
      normalized
    )
  ) {
    return null;
  }

  return directSolanaSettlementAssets[
    normalized as DirectSolanaSettlementAssetSymbol
  ];
}
