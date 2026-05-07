"use client";

import { fetchApi } from "@/lib/api";

export type WorkspaceSettings = {
  id: string;
  merchantId: string;
  business: {
    name: string;
    supportEmail: string;
    defaultMarket: string;
    timezone: string;
    displayMode: string;
    fallbackCurrency: string;
    statementDescriptor: string;
    brandAccent: string;
    logoUrl: string | null;
    customerDomain: string;
  };
  wallets: {
    primaryWallet: string;
    walletAlerts: boolean;
  };
  checkout: {
    mode: "modal" | "redirect";
    returnPage: string | null;
    allowedDomains: string[];
  };
  notifications: {
    verificationAlerts: boolean;
    developerAlerts: boolean;
    securityAlerts: boolean;
  };
  security: {
    sessionTimeout: string;
    enforceTwoFactor: boolean;
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
  payload: Partial<Pick<WorkspaceSettings, "business" | "wallets" | "checkout" | "notifications" | "security">>;
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
  walletAlerts: boolean;
}) {
  const response = await fetchApi<{
    settings: WorkspaceSettings;
  }>(`/settings/${input.merchantId}/wallets/save`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
      primaryWallet: input.primaryWallet,
      walletAlerts: input.walletAlerts,
    }),
  });

  return response.data;
}
