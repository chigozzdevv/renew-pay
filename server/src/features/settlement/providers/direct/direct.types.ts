import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export type DirectSolanaRouteConfigInput = {
  environment?: RuntimeMode | string | null;
  mode?: string | null;
  provider?: string | null;
  chain?: string | null;
  assetSymbol?: string | null;
  assetMint?: string | null;
  assetDecimals?: number | null;
  destinationAddress?: string | null;
  status?: string | null;
};

export type DirectSolanaPayoutExecutionInput = {
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

export type DirectSolanaPayoutExecutionResult = {
  status: "settled";
  txHash: string;
  settledAt: Date;
};
