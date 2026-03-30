export type RenewInvoiceStatus =
  | "draft"
  | "issued"
  | "pending_payment"
  | "processing"
  | "paid"
  | "overdue"
  | "void";

export type RenewPublicInvoiceNextAction =
  | "none"
  | "complete_verification"
  | "create_payment"
  | "show_payment_instructions"
  | "wait_for_settlement"
  | "complete_test_payment";

export type RenewInvoiceLineItem = {
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountUsd: number;
  readonly totalAmountUsd: number;
};

export type RenewInvoicePaymentInstructions = {
  readonly provider: "partna" | "yellow_card" | null;
  readonly kind: "bank_transfer" | "redirect" | null;
  readonly externalChargeId: string | null;
  readonly billingCurrency: string | null;
  readonly localAmount: number | null;
  readonly usdcAmount: number | null;
  readonly feeAmount: number | null;
  readonly status: string | null;
  readonly reference: string | null;
  readonly expiresAt: string | Date | null;
  readonly redirectUrl: string | null;
  readonly bankTransfer: {
    readonly bankCode: string | null;
    readonly bankName: string | null;
    readonly accountNumber: string | null;
    readonly accountName: string | null;
    readonly currency: string | null;
  } | null;
} | null;

export type RenewInvoiceVerification = {
  readonly provider: "partna" | "yellow_card" | null;
  readonly status: string | null;
  readonly country: string | null;
  readonly currency: string | null;
  readonly instructions: string | null;
  readonly verificationHint: string | null;
  readonly verificationMethods: readonly {
    readonly method: string;
    readonly hint: string | null;
  }[];
  readonly requiredFields: readonly string[];
} | null;

export type RenewPublicInvoiceRecord = {
  readonly brand: {
    readonly name: string;
    readonly logoUrl: string | null;
  };
  readonly invoiceNumber: string;
  readonly publicToken: string;
  readonly title: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly billingCurrency: string;
  readonly status: RenewInvoiceStatus;
  readonly note: string | null;
  readonly dueDate: string;
  readonly issuedAt: string | null;
  readonly paidAt: string | null;
  readonly lineItems: readonly RenewInvoiceLineItem[];
  readonly totals: {
    readonly usdAmount: number;
    readonly localAmount: number;
    readonly fxRate: number;
    readonly usdcAmount: number;
    readonly feeAmount: number;
  };
  readonly nextAction: RenewPublicInvoiceNextAction;
  readonly verification: RenewInvoiceVerification;
  readonly charge: {
    readonly id: string;
    readonly externalChargeId: string;
    readonly status: string;
    readonly failureCode: string | null;
    readonly processedAt: string;
  } | null;
  readonly settlement: {
    readonly id: string;
    readonly status: string;
    readonly netUsdc: number;
    readonly grossUsdc: number;
    readonly creditTxHash: string | null;
    readonly bridgeSourceTxHash: string | null;
    readonly bridgeReceiveTxHash: string | null;
  } | null;
  readonly paymentInstructions: RenewInvoicePaymentInstructions;
  readonly testMode: {
    readonly enabled: boolean;
    readonly canCompletePayment: boolean;
  };
};

export type SubmitPublicInvoiceVerificationInput = {
  readonly bvn?: string;
  readonly verificationMethod?: string;
  readonly phone?: string;
  readonly otp?: string;
};
