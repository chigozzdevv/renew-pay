import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { RenewPrivyProvider } from "@/components/shared/privy-provider";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

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
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>
        <RenewPrivyProvider>{children}</RenewPrivyProvider>
      </body>
    </html>
  );
}
