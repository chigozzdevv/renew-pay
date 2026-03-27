export type RenewEnvironment = "sandbox" | "live";

export type RenewCheckoutStatus =
  | "open"
  | "scheduled"
  | "pending_payment"
  | "processing"
  | "settled"
  | "failed"
  | "expired";

export type RenewCheckoutNextAction =
  | "submit_customer"
  | "wait_for_charge"
  | "complete_test_payment"
  | "wait_for_provider"
  | "wait_for_settlement"
  | "none";

export type RenewCheckoutSessionPlan = {
  readonly id: string;
  readonly planCode: string;
  readonly name: string;
  readonly usdAmount: number;
  readonly billingIntervalDays: number;
  readonly trialDays: number;
  readonly retryWindowHours: number;
  readonly billingMode: string;
  readonly supportedMarkets: readonly string[];
};

export type RenewCheckoutSessionCustomer = {
  readonly name: string;
  readonly email: string;
  readonly market: string;
  readonly paymentAccountType: string;
  readonly paymentAccountNumber: string | null;
  readonly paymentNetworkId: string | null;
};

export type RenewCheckoutSessionCharge = {
  readonly id: string;
  readonly externalChargeId: string;
  readonly status: string;
  readonly localAmount: number;
  readonly usdcAmount: number;
  readonly feeAmount: number;
  readonly failureCode: string | null;
  readonly processedAt: string | Date;
};

export type RenewCheckoutSessionSettlement = {
  readonly id: string;
  readonly status: string;
  readonly netUsdc: number;
  readonly grossUsdc: number;
  readonly destinationWallet: string | null;
  readonly bridgeSourceTxHash: string | null;
  readonly bridgeReceiveTxHash: string | null;
  readonly creditTxHash: string | null;
};

export type RenewCheckoutPaymentInstructions = {
  readonly externalChargeId: string | null;
  readonly billingCurrency: string | null;
  readonly localAmount: number | null;
  readonly usdcAmount: number | null;
  readonly feeAmount: number | null;
  readonly status: string | null;
  readonly collectionId: string | null;
  readonly collectionSequenceId: string | null;
  readonly reference: string | null;
  readonly depositId: string | null;
  readonly expiresAt: string | Date | null;
  readonly bankInfo: {
    readonly name: string | null;
    readonly accountNumber: string | null;
    readonly accountName: string | null;
  } | null;
};

export type RenewCheckoutMarketQuote = {
  readonly currency: string;
  readonly localAmount: number;
  readonly usdcAmount: number;
  readonly fxRate: number;
  readonly feeAmount: number;
  readonly expiresAt: string | Date | null;
  readonly settlementAsset: "USDC";
  readonly settlementNetwork: "AVALANCHE";
  readonly channel: {
    readonly externalId: string;
    readonly country: string;
    readonly channelType: string;
    readonly estimatedSettlementTime: number;
    readonly min: number;
    readonly max: number;
  };
  readonly network: {
    readonly externalId: string;
    readonly name: string;
    readonly country: string;
    readonly accountNumberType: string | null;
  } | null;
};

export type RenewCheckoutSession = {
  readonly id: string;
  readonly environment: RenewEnvironment;
  readonly status: RenewCheckoutStatus;
  readonly expiresAt: string | Date;
  readonly submittedAt: string | Date | null;
  readonly completedAt: string | Date | null;
  readonly nextAction: RenewCheckoutNextAction;
  readonly plan: RenewCheckoutSessionPlan;
  readonly customer: RenewCheckoutSessionCustomer | null;
  readonly charge: RenewCheckoutSessionCharge | null;
  readonly settlement: RenewCheckoutSessionSettlement | null;
  readonly paymentInstructions: RenewCheckoutPaymentInstructions | null;
  readonly failureReason: string | null;
  readonly testMode: {
    readonly enabled: boolean;
    readonly canCompletePayment: boolean;
  };
};

export type CreateCheckoutSessionInput = {
  readonly planId: string;
  readonly expiresInMinutes?: number;
  readonly metadata?: Record<string, unknown>;
};

export type RenewCheckoutPlan = {
  readonly id: string;
  readonly planCode: string;
  readonly name: string;
  readonly usdAmount: number;
  readonly usageRate: number | null;
  readonly billingIntervalDays: number;
  readonly trialDays: number;
  readonly retryWindowHours: number;
  readonly billingMode: string;
  readonly supportedMarkets: readonly string[];
};

export type CreateCheckoutSessionResult = {
  readonly clientSecret: string;
  readonly session: RenewCheckoutSession;
};

export type SubmitCheckoutCustomerInput = {
  readonly name: string;
  readonly email: string;
  readonly market: string;
  readonly paymentAccountType?: "bank" | "momo";
  readonly paymentAccountNumber?: string;
  readonly paymentNetworkId?: string;
  readonly metadata?: Record<string, unknown>;
};
