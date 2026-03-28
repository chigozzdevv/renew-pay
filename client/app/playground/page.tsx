import type { Metadata } from "next";

import { Footer } from "@/components/landing/footer";
import { PlaygroundPageClient } from "@/components/playground/playground-page-client";
import { Header } from "@/components/shared/header";

export const metadata: Metadata = {
  title: "Renew Playground | Session-Based Checkout Demo",
  description:
    "Try the Renew checkout flow with active plans, a real session API, and the test settlement path.",
};

export default function PlaygroundPage() {
  return (
    <div className="page-shell flex min-h-screen flex-col bg-[#e8f5e9]">
      <Header />
      <main className="flex-1">
        <PlaygroundPageClient />
      </main>
      <Footer tone="hero" />
    </div>
  );
}
