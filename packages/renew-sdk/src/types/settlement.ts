import type { RenewRuntimeMode } from "./payment.js";

export type RenewSettlementMode = "standard" | "private";
export type RenewSettlementProvider = "direct" | "umbra";
export type RenewSettlementChain = "solana" | "avalanche";
export type RenewSettlementRouteStatus = "active" | "disabled";

export type RenewSettlementRouteRecord = {
  readonly id: string;
  readonly merchantId: string;
  readonly environment: RenewRuntimeMode;
  readonly routeCode: string;
  readonly name: string;
  readonly mode: RenewSettlementMode;
  readonly provider: RenewSettlementProvider;
  readonly chain: RenewSettlementChain;
  readonly assetSymbol: string;
  readonly assetMint: string | null;
  readonly assetDecimals: number;
  readonly destinationAddress: string | null;
  readonly feeBps: number;
  readonly isDefault: boolean;
  readonly status: RenewSettlementRouteStatus;
  readonly privacy: {
    readonly provider: string | null;
    readonly strategy: string | null;
    readonly poolMint: string | null;
    readonly viewingKeyPolicy: string | null;
  } | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
};

export type CreateRenewSettlementRouteInput = {
  readonly routeCode?: string;
  readonly name: string;
  readonly mode?: RenewSettlementMode;
  readonly provider?: RenewSettlementProvider;
  readonly chain?: RenewSettlementChain;
  readonly assetSymbol?: string;
  readonly assetMint?: string | null;
  readonly assetDecimals?: number;
  readonly destinationAddress?: string | null;
  readonly feeBps?: number;
  readonly isDefault?: boolean;
  readonly status?: RenewSettlementRouteStatus;
  readonly privacy?: {
    readonly strategy?: "receiver_claimable_utxo";
    readonly viewingKeyPolicy?: "merchant_controlled";
  } | null;
  readonly metadata?: Record<string, unknown>;
};

export type UpdateRenewSettlementRouteInput =
  Partial<CreateRenewSettlementRouteInput>;

export type ListRenewSettlementRoutesQuery = {
  readonly mode?: RenewSettlementMode;
  readonly provider?: RenewSettlementProvider;
  readonly chain?: RenewSettlementChain;
  readonly status?: RenewSettlementRouteStatus;
  readonly search?: string;
  readonly page?: number;
  readonly limit?: number;
};
