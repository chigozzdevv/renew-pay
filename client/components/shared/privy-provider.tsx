"use client";

import type { ReactNode } from "react";

import { PrivyProvider } from "@privy-io/react-auth";

export function RenewPrivyProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();

  if (!appId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["passkey", "email"],
        appearance: {
          theme: "light",
          accentColor: "#0c4a27",
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "all-users",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
