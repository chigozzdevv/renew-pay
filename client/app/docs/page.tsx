import type { Metadata } from "next";
import { Suspense } from "react";

import { DocsPageClient } from "@/components/docs/docs-page-client";

export const metadata: Metadata = {
  title: "Renew Docs | Collections, Settlement, and Webhooks",
  description:
    "Public docs for Renew collections, Stellar settlement, payouts, webhooks, and customer APIs.",
};

export default function DocsPage() {
  return (
    <div className="page-shell min-h-screen">
      <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#ffffff_72%,#fcfdfb_100%)]">
        <Suspense fallback={null}>
          <DocsPageClient />
        </Suspense>
      </main>
    </div>
  );
}
