import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { RenewPrivyProvider } from "@/components/shared/privy-provider";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Renew | Stablecoin Billing for Fiat-First Markets",
  description:
    "Renew is a stablecoin billing and settlement platform for modern merchants collecting local fiat across fiat-first markets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={geist.variable}>
        <RenewPrivyProvider>{children}</RenewPrivyProvider>
      </body>
    </html>
  );
}
