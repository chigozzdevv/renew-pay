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
        loginMethods: ["google", "passkey", "email"],
        appearance: {
          theme: "light",
          accentColor: "#111111",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
