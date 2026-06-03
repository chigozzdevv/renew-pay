import type { RenewRuntimeMode } from "./payment.js";

export type RenewSettlementAccountStatus = "active" | "disabled";

export type RenewSettlementAccountRecord = {
  readonly id: string;
  readonly merchantId: string;
  readonly environment: RenewRuntimeMode;
  readonly accountCode: string;
  readonly name: string;
  readonly assetSymbol: string;
  readonly destinationAddress: string | null;
  readonly isDefault: boolean;
  readonly status: RenewSettlementAccountStatus;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
};

export type CreateRenewSettlementAccountInput = {
  readonly accountCode?: string;
  readonly name: string;
  readonly assetSymbol?: "USDC";
  readonly destinationAddress?: string | null;
  readonly isDefault?: boolean;
  readonly status?: RenewSettlementAccountStatus;
  readonly metadata?: Record<string, unknown>;
};

export type UpdateRenewSettlementAccountInput =
  Partial<CreateRenewSettlementAccountInput>;

export type ListRenewSettlementAccountsQuery = {
  readonly status?: RenewSettlementAccountStatus;
  readonly search?: string;
  readonly page?: number;
  readonly limit?: number;
};
