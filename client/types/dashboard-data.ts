export type OverviewPayload = {
  stats: {
    totalCustomers: number;
    atRiskCustomers: number;
    activePlans: number;
    meteredPlans: number;
    activeSubscriptions: number;
    pendingSettlements: number;
    readyNetUsdc: number;
    settledUsdc30d: number;
  };
  marketMix: Array<{
    market: string;
    totalVolume: number;
    share: number;
  }>;
  upcomingRenewals: Array<{
    subscriptionId: string;
    customerName: string;
    planName: string;
    billingCurrency: string;
    localAmount: number;
    nextChargeAt: string;
  }>;
};

export type CustomerRecord = {
  id: string;
  merchantId: string;
  customerRef: string;
  name: string;
  email: string;
  market: string;
  status: string;
  billingState: string;
  paymentMethodState: string;
  subscriptionCount: number;
  monthlyVolumeUsdc: number;
  nextRenewalAt: string | null;
  lastChargeAt: string | null;
  autoReminderEnabled: boolean;
  blacklistedAt: string | null;
  blacklistReason: string | null;
};

export type PlanRecord = {
  id: string;
  merchantId: string;
  planCode: string;
  name: string;
  usdAmount: number;
  usageRate: number | null;
  billingIntervalDays: number;
  trialDays: number;
  retryWindowHours: number;
  billingMode: string;
  supportedMarkets: string[];
  status: string;
  pendingStatus: string | null;
  onchain: {
    id: string | null;
    status: string;
    operationId: string | null;
    txHash: string | null;
  };
};

export type SubscriptionRecord = {
  id: string;
  merchantId: string;
  planId: string;
  customerRef: string;
  customerName: string;
  billingCurrency: string;
  localAmount: number;
  paymentAccountType: string;
  paymentAccountNumber: string | null;
  paymentNetworkId: string | null;
  status: string;
  pendingStatus: string | null;
  nextChargeAt: string;
  lastChargeAt: string | null;
  retryAvailableAt: string | null;
  onchain: {
    id: string | null;
    status: string;
    operationId: string | null;
    txHash: string | null;
  };
};

export type ChargeRecord = {
  id: string;
  merchantId: string;
  sourceKind: "subscription" | "invoice";
  subscriptionId: string | null;
  invoiceId: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  externalChargeId: string;
  settlementSource: string | null;
  localAmount: number;
  fxRate: number;
  usdcAmount: number;
  feeAmount: number;
  status: string;
  failureCode: string | null;
  processedAt: string;
};

export type InvoiceRecord = {
  id: string;
  merchantId: string;
  environment: "test" | "live";
  invoiceNumber: string;
  publicToken: string;
  publicUrl: string;
  title: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  billingCurrency: string;
  status: string;
  note: string | null;
  dueDate: string;
  issuedAt: string | null;
  sentAt: string | null;
  lastRemindedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmountUsd: number;
    totalAmountUsd: number;
  }>;
  totals: {
    usdAmount: number;
    localAmount: number;
    fxRate: number;
    usdcAmount: number;
    feeAmount: number;
  };
  charge: {
    id: string;
    externalChargeId: string;
    status: string;
    failureCode: string | null;
    processedAt: string;
  } | null;
  settlement: {
    id: string;
    status: string;
    netUsdc: number;
    grossUsdc: number;
    creditTxHash: string | null;
  } | null;
  paymentInstructions: {
    provider: string | null;
    kind: string | null;
    externalChargeId: string | null;
    billingCurrency: string | null;
    localAmount: number | null;
    usdcAmount: number | null;
    feeAmount: number | null;
    status: string | null;
    reference: string | null;
    expiresAt: string | null;
    redirectUrl: string | null;
    bankTransfer: {
      bankCode: string | null;
      bankName: string | null;
      accountNumber: string | null;
      accountName: string | null;
      currency: string | null;
    } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type SettlementRecord = {
  id: string;
  merchantId: string;
  sourceChargeId: string | null;
  batchRef: string;
  sourceKind: "subscription" | "invoice";
  commercialRef: string | null;
  localAmount: number | null;
  fxRate: number | null;
  grossUsdc: number;
  feeUsdc: number;
  netUsdc: number;
  destinationWallet: string;
  status: string;
  txHash: string | null;
  submittedAt: string | null;
  scheduledFor: string;
  settledAt: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
};

export type TeamMemberRecord = {
  id: string;
  merchantId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  markets: string[];
  permissions: string[];
  access: string;
  lastActiveAt: string | null;
  inviteSentAt: string | null;
};

export type DeveloperKeyRecord = {
  id: string;
  merchantId: string;
  label: string;
  environment: string;
  maskedToken: string;
  status: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type DeveloperWebhookRecord = {
  id: string;
  merchantId: string;
  label: string;
  endpointUrl: string;
  status: string;
  eventTypes: string[];
  retryPolicy: string;
  lastDeliveryAt: string | null;
  disabledAt: string | null;
};

export type DeveloperDeliveryRecord = {
  id: string;
  merchantId: string;
  webhookId: string;
  eventType: string;
  status: string;
  httpStatus: number | null;
  attempts: number;
  errorMessage: string | null;
  deliveredAt: string | null;
};

export type AuditRecord = {
  id: string;
  merchantId: string;
  actor: string;
  action: string;
  category: string;
  status: string;
  target: string | null;
  detail: string;
  createdAt: string;
};

export type TreasurySignerRecord = {
  id: string;
  merchantId: string;
  teamMemberId: string;
  walletAddress: string;
  status: string;
  verifiedAt: string | null;
  lastApprovedAt: string | null;
};

export type TreasuryOperationRecord = {
  id: string;
  merchantId: string;
  treasuryAccountId: string;
  settlementId: string | null;
  kind: string;
  status: string;
  governanceMultisigAddress: string;
  governanceVaultAddress: string;
  threshold: number;
  approvedCount: number;
  canExecute: boolean;
  targetAddress: string;
  origin: string;
  createdBy: string;
  signatures: Array<{
    teamMemberId: string;
    name: string;
    email: string;
    role: string;
    walletAddress: string;
    signedAt: string;
  }>;
  txHash: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  executedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type TreasuryPayload = {
  account: {
    id: string;
    merchantId: string;
    custodyModel: string;
    governanceMultisigAddress: string;
    governanceVaultAddress: string;
    payoutWallet: string;
    reserveWallet: string | null;
    ownerAddresses: string[];
    threshold: number;
    governanceVaultIndex: number;
    network: string;
    gasPolicy: string;
    status: string;
    pendingPayoutWallet: string | null;
    payoutWalletChangeReadyAt: string | null;
    lastSyncedAt: string | null;
  } | null;
  signers: TreasurySignerRecord[];
  operations: TreasuryOperationRecord[];
};

export type SettingsPayload = {
  id: string;
  merchantId: string;
  business: {
    name: string;
    supportEmail: string;
    defaultMarket: string;
    invoicePrefix: string;
    billingTimezone: string;
    billingDisplay: string;
    fallbackCurrency: string;
    statementDescriptor: string;
    brandAccent: string;
    logoUrl: string | null;
    customerDomain: string;
    invoiceFooter: string;
  };
  billing: {
    retryPolicy: string;
    invoiceGraceDays: number;
    autoRetries: boolean;
    meterApproval: boolean;
  };
  wallets: {
    primaryWallet: string;
    reserveWallet: string | null;
    walletAlerts: boolean;
    governanceVaultAddress: string | null;
    pendingPayoutWallet: string | null;
    payoutWalletChangeReadyAt: string | null;
  };
  notifications: {
    customerSubscriptionEmails: boolean;
    customerReceiptEmails: boolean;
    customerPaymentFollowUps: boolean;
    merchantSubscriptionAlerts: boolean;
    merchantPaymentDigestFrequency: "off" | "daily" | "weekly" | "monthly";
    merchantPaymentDigestMode: "counts" | "detailed";
    teamInviteEmails: boolean;
    governanceAlerts: boolean;
    treasuryAlerts: boolean;
    verificationAlerts: boolean;
    developerAlerts: boolean;
    securityAlerts: boolean;
  };
  security: {
    sessionTimeout: string;
    inviteDomainPolicy: string;
    enforceTwoFactor: boolean;
    restrictInviteDomains: boolean;
  };
  treasury: {
    threshold: number;
    pendingOperations: Array<{
      id: string;
      kind: string;
      status: string;
    }>;
  };
};
