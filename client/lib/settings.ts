"use client";

import { fetchApi } from "@/lib/api";
import type { TreasuryOperation } from "@/lib/treasury";

export type WorkspaceSettings = {
  id: string;
  merchantId: string;
  profile: {
    businessName: string;
    supportEmail: string;
    defaultMarket: string;
    invoicePrefix: string;
    billingTimezone: string;
    billingDisplay: string;
    fallbackCurrency: string;
    statementDescriptor: string;
    brandAccent: string;
    emailLogoUrl: string | null;
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
  createdAt: string;
  updatedAt: string;
};

export async function loadWorkspaceSettings(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<WorkspaceSettings>(
    `/settings/${input.merchantId}`,
    {
      token: input.token,
      query: {
        environment: input.environment,
      },
    }
  );

  return response.data;
}

export async function updateWorkspaceSettings(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  payload: Partial<Pick<WorkspaceSettings, "profile" | "billing" | "notifications" | "security">>;
}) {
  const response = await fetchApi<WorkspaceSettings>(
    `/settings/${input.merchantId}`,
    {
      method: "PATCH",
      token: input.token,
      body: JSON.stringify({
        ...input.payload,
        environment: input.environment,
      }),
    }
  );

  return response.data;
}

export async function saveWalletSettings(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  primaryWallet: string;
  reserveWallet: string | null;
  walletAlerts: boolean;
}) {
  const response = await fetchApi<{
    settings: WorkspaceSettings;
    operations: TreasuryOperation[];
  }>(`/settings/${input.merchantId}/wallets/save`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
      primaryWallet: input.primaryWallet,
      reserveWallet: input.reserveWallet,
      walletAlerts: input.walletAlerts,
    }),
  });

  return response.data;
}

export async function confirmPrimaryWalletChange(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<{
    settings: WorkspaceSettings;
    operation: TreasuryOperation;
  }>(`/settings/${input.merchantId}/wallets/confirm-primary`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
    }),
  });

  return response.data;
}

export async function promoteReserveWallet(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<{
    settings: WorkspaceSettings;
    operation: TreasuryOperation;
  }>(`/settings/${input.merchantId}/wallets/promote-reserve`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
    }),
  });

  return response.data;
}

export async function removeReserveWallet(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<{
    settings: WorkspaceSettings;
    operation: TreasuryOperation;
  }>(`/settings/${input.merchantId}/wallets/remove-reserve`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
    }),
  });

  return response.data;
}
