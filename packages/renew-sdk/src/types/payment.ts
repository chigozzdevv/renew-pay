export type RenewEnvironment = "sandbox" | "live";

export type RenewRuntimeMode = "test" | "live";

export type RenewPaymentStatus =
  | "open"
  | "pending"
  | "paid"
  | "settling"
  | "settled"
  | "failed"
  | "cancelled";

export type RenewRecurringInterval = "day" | "week" | "month" | "year";

export type RenewPaymentRecurring = {
  readonly enabled: boolean;
  readonly interval: RenewRecurringInterval | null;
  readonly intervalCount: number | null;
  readonly startsAt?: string | Date | null;
  readonly endsAt?: string | Date | null;
};

export type RenewPaymentCollection = {
  readonly provider: "partna";
  readonly status: string;
  readonly externalId?: string | null;
  readonly localAmount: number | null;
  readonly fxRate?: number | null;
  readonly stableAmount: number | null;
  readonly feeAmount: number | null;
  readonly paidAt: string | Date | null;
};

export type RenewPaymentRecord = {
  readonly id: string;
  readonly merchantId: string;
  readonly environment: RenewRuntimeMode;
  readonly payId: string;
  readonly customerId: string | null;
  readonly settlementAccountId: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly description: string;
  readonly status: RenewPaymentStatus;
  readonly paymentUrl: string;
  readonly recurring: RenewPaymentRecurring;
  readonly collection: RenewPaymentCollection;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
};

export type RenewCollectionStatus =
  | "created"
  | "collecting"
  | "paid"
  | "failed"
  | "cancelled";

export type RenewPublicCheckoutState =
  | "needs_customer"
  | "ready_to_pay"
  | "needs_bvn"
  | "needs_verification_method"
  | "needs_phone"
  | "needs_otp"
  | "show_bank_transfer"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled";

export type RenewCollectionRecord = {
  readonly id: string;
  readonly paymentId: string;
  readonly reference: string;
  readonly amount: number;
  readonly currency: string;
  readonly description: string;
  readonly status: RenewCollectionStatus;
  readonly checkoutUrl: string;
  readonly recurring: RenewPaymentRecurring;
  readonly settlement: {
    readonly id: string;
  } | null;
  readonly customer: {
    readonly reference: string | null;
    readonly email: string | null;
    readonly name: string | null;
  } | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
};

export type RenewPublicPaymentRecord = {
  readonly payId: string;
  readonly amount: number;
  readonly currency: string;
  readonly description: string | null;
  readonly status: RenewPaymentStatus;
  readonly paymentUrl: string;
  readonly merchant: {
    readonly name: string;
    readonly supportEmail: string | null;
    readonly logoUrl: string | null;
  };
  readonly recurring: {
    readonly enabled: boolean;
    readonly interval: RenewRecurringInterval | null;
    readonly intervalCount: number | null;
  };
  readonly customer: {
    readonly reference: string | null;
    readonly email: string | null;
    readonly name: string | null;
  };
  readonly checkout: {
    readonly state: RenewPublicCheckoutState;
    readonly verification: {
      readonly methods: readonly {
        readonly method: string;
        readonly hint: string | null;
      }[];
      readonly selectedMethod: string | null;
      readonly selectedHint: string | null;
      readonly phoneConfirmationRequired: boolean;
      readonly message: string | null;
      readonly bvnLast4: string | null;
    };
    readonly returnPage: string | null;
    readonly bankTransfer: {
      readonly bankCode: string | null;
      readonly bankName: string | null;
      readonly accountName: string | null;
      readonly accountNumber: string | null;
      readonly currency: string | null;
    } | null;
  };
  readonly collection: {
    readonly provider: "partna";
    readonly status: string;
    readonly localAmount: number;
    readonly stableAmount: number | null;
    readonly feeAmount: number | null;
    readonly paidAt: string | Date | null;
    readonly paymentUrl: string | null;
  };
};

export type CreateRenewPaymentInput = {
  readonly customerId?: string | null;
  readonly settlementAccountId?: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly description: string;
  readonly recurring?: {
    readonly enabled?: boolean;
    readonly interval?: RenewRecurringInterval | null;
    readonly intervalCount?: number | null;
    readonly startsAt?: string | Date | null;
    readonly endsAt?: string | Date | null;
  };
  readonly metadata?: Record<string, unknown>;
};

export type CreateRenewCollectionInput = {
  readonly amount: number;
  readonly currency: string;
  readonly reference: string;
  readonly description?: string;
  readonly recurring?: {
    readonly enabled?: boolean;
    readonly interval?: RenewRecurringInterval | null;
    readonly intervalCount?: number | null;
    readonly startsAt?: string | Date | null;
    readonly endsAt?: string | Date | null;
  };
  readonly settlement?: string;
  readonly customer?: {
    readonly reference?: string;
    readonly email?: string;
    readonly name?: string;
  };
  readonly metadata?: Record<string, unknown>;
};

export type ListRenewPaymentsQuery = {
  readonly status?: RenewPaymentStatus;
  readonly recurring?: boolean;
  readonly search?: string;
  readonly page?: number;
  readonly limit?: number;
};

export type ListRenewCollectionsQuery = Omit<ListRenewPaymentsQuery, "status"> & {
  readonly status?: RenewCollectionStatus;
};

export type UpdateRenewPaymentInput = Partial<CreateRenewPaymentInput> & {
  readonly status?: RenewPaymentStatus;
};

export type StartRenewPublicPaymentInput = {
  readonly payerEmail?: string;
  readonly payerName?: string;
  readonly customer?: {
    readonly reference?: string;
    readonly email?: string;
    readonly name?: string;
  };
};
