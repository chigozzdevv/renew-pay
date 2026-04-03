import type { Metadata } from "next";
import { Suspense } from "react";

import { ProductsPageClient } from "@/components/landing/products-page-client";

export const metadata: Metadata = {
  title: "Renew Products | Subscription and Invoice Billing",
  description:
    "Explore Renew subscription and invoice flows for local collection and stablecoin settlement.",
};

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPageClient />
    </Suspense>
  );
}
