import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export type UmbraPrivacyStrategy = "receiver_claimable_utxo";

export type UmbraRoutePrivacy = {
  provider: "umbra";
  strategy: UmbraPrivacyStrategy;
  poolMint: string;
  viewingKeyPolicy: "merchant_controlled";
};

export type BuildUmbraRoutePrivacyInput = {
  assetSymbol: string;
  assetMint?: string | null;
};

export type UmbraRouteConfigInput = {
  environment?: RuntimeMode | string | null;
  mode?: string | null;
  chain?: string | null;
  assetSymbol?: string | null;
  assetMint?: string | null;
  assetDecimals?: number | null;
  destinationAddress?: string | null;
  status?: string | null;
};

export type UmbraPayoutExecutionInput = {
  payoutId: string;
  merchantId: string;
  environment: RuntimeMode;
  routeId: string;
  amount: number;
  assetSymbol: string;
  assetMint: string;
  assetDecimals: number;
  destinationAddress: string;
};

export type UmbraPayoutExecutionResult = {
  status: "settled";
  txHash: string;
  createProofAccountTxHash: string;
  closeProofAccountTxHash?: string | null;
  settledAt: Date;
};
