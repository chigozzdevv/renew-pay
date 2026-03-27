export type BillingMode = "fixed" | "metered";

export type MerchantStatus = "active" | "paused";

export type PlanStatus = "draft" | "active" | "archived";

export type SubscriptionStatus =
  | "active"
  | "paused"
  | "cancelled"
  | "past_due";

export type ChargeStatus = "pending" | "settled" | "failed";

export type SettlementStatus = "queued" | "confirming" | "settled";

export type Address = `0x${string}`;

export type MerchantRecord = {
  readonly id: string;
  readonly merchantAccount: Address;
  readonly payoutWallet: Address;
  readonly reserveWallet: Address | null;
  readonly name: string;
  readonly supportEmail: string;
  readonly billingTimezone: string;
  readonly supportedMarkets: readonly string[];
  readonly metadataHash: string;
  readonly status: MerchantStatus;
  readonly createdAt: string;
};

export type PlanRecord = {
  readonly id: string;
  readonly merchantId: string;
  readonly planCode: string;
  readonly name: string;
  readonly usdAmount: number;
  readonly usageRate: number | null;
  readonly billingIntervalDays: number;
  readonly trialDays: number;
  readonly retryWindowHours: number;
  readonly billingMode: BillingMode;
  readonly supportedMarkets: readonly string[];
  readonly status: PlanStatus;
  readonly createdAt: string;
};

export type SubscriptionRecord = {
  readonly id: string;
  readonly merchantId: string;
  readonly planId: string;
  readonly customerRef: string;
  readonly customerName: string;
  readonly billingCurrency: string;
  readonly localAmount: number;
  readonly status: SubscriptionStatus;
  readonly nextChargeAt: string;
  readonly lastChargeAt: string | null;
  readonly retryAvailableAt: string | null;
  readonly createdAt: string;
};

export type ChargeRecord = {
  readonly id: string;
  readonly merchantId: string;
  readonly subscriptionId: string;
  readonly externalChargeId: string;
  readonly settlementSource: Address | null;
  readonly localAmount: number;
  readonly fxRate: number;
  readonly usdcAmount: number;
  readonly feeAmount: number;
  readonly status: ChargeStatus;
  readonly failureCode: string | null;
  readonly processedAt: string;
};

export type SettlementRecord = {
  readonly id: string;
  readonly merchantId: string;
  readonly batchRef: string;
  readonly grossUsdc: number;
  readonly feeUsdc: number;
  readonly netUsdc: number;
  readonly destinationWallet: Address;
  readonly status: SettlementStatus;
  readonly txHash: string | null;
  readonly scheduledFor: string;
  readonly settledAt: string | null;
};

export type RenewProtocolConfig = {
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly protocolAddress: Address;
  readonly vaultAddress: Address;
  readonly settlementAssetAddress: Address;
};
