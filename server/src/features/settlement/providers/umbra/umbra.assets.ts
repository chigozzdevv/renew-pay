export const umbraSettlementAssets = {
  USDC: {
    symbol: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
  },
} as const;

export type UmbraSettlementAssetSymbol = keyof typeof umbraSettlementAssets;
export type UmbraSettlementAsset =
  (typeof umbraSettlementAssets)[UmbraSettlementAssetSymbol];

export function getUmbraSettlementAsset(
  assetSymbol: string
): UmbraSettlementAsset | null {
  const normalized = assetSymbol.trim().toUpperCase();

  if (
    !Object.prototype.hasOwnProperty.call(umbraSettlementAssets, normalized)
  ) {
    return null;
  }

  return umbraSettlementAssets[normalized as UmbraSettlementAssetSymbol];
}

export function isUmbraSettlementAsset(assetSymbol: string) {
  return getUmbraSettlementAsset(assetSymbol) !== null;
}
