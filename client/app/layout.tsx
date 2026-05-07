import type { Metadata } from "next";

import { RenewPrivyProvider } from "@/components/shared/privy-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Renew | Local Payments with Stable Settlement",
  description:
    "Renew helps merchants collect local fiat payments and settle in stable assets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <RenewPrivyProvider>{children}</RenewPrivyProvider>
      </body>
    </html>
  );
}
