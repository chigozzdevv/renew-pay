"use client";

import type { ReactNode } from "react";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

const solanaConnectors = toSolanaWalletConnectors();

export function RenewPrivyProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();

  if (!appId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google", "passkey", "email"],
        appearance: {
          theme: "light",
          accentColor: "#111111",
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "all-users",
          },
        },
        walletConnectors: [solanaConnectors],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
