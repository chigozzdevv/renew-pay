import type { Metadata } from "next";
import { Suspense } from "react";

import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/shared/header";
import { Reveal } from "@/components/ui/reveal";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

const enterpriseOffers = [
  {
    title: "Custom pricing at volume",
    body: "Get commercial terms aligned to sustained billing volume.",
  },
  {
    title: "Provider choice by market",
    body: "Pick the payment providers you want for each country, corridor, or product.",
  },
  {
    title: "Flexible treasury controls",
    body: "Set settlement timing, payout rules, and approvals to match internal operations.",
  },
  {
    title: "Dedicated rollout support",
    body: "Launch migrations, expansions, and critical go-lives with a tighter delivery track.",
  },
  {
    title: "Performance visibility",
    body: "Monitor provider quality, billing exceptions, and operational risk more closely.",
  },
] as const;

export const metadata: Metadata = {
  title: "Renew Enterprise | High-Volume Billing Infrastructure",
  description:
    "Renew Enterprise is built for high-volume billing teams that need custom fees, provider choice, and tighter treasury controls.",
};

export default function EnterprisePage() {
  return (
    <div className="page-shell flex min-h-screen flex-col bg-[#fdf1e7]">
      <Suspense fallback={null}>
        <Header tone="feature" />
      </Suspense>

      <main className="flex-1">
        <section className="overflow-hidden pb-20 pt-12 sm:pb-24 sm:pt-16 lg:pb-28 lg:pt-20">
          <Container>
            <Reveal offset={28}>
              <div className="grid lg:grid-cols-[minmax(0,0.94fr)_1px_minmax(0,1.06fr)]">
                <div className="px-7 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
                  <span className="inline-flex h-12 items-center rounded-full bg-[#111111] px-6 text-sm font-medium uppercase tracking-[0.16em] text-white">
                    Coming soon
                  </span>
                  <h2 className="mt-8 max-w-[10ch] font-display text-[clamp(2.8rem,5.8vw,4.9rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
                    Built for high-volume billing teams.
                  </h2>
                </div>

                <div className="h-px bg-black/8 lg:hidden" />
                <div className="hidden lg:block bg-black/8" />

                <div className="px-7 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
                  <div className="space-y-0">
                    {enterpriseOffers.map((offer, index) => (
                      <div
                        key={offer.title}
                        className={cn(
                          "grid gap-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-5",
                          index > 0 && "border-t border-black/8",
                        )}
                      >
                        <span className="pt-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7a6d63]">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <div>
                          <h3 className="text-[1.08rem] font-medium leading-[1.15] tracking-[-0.02em] text-[#111111] sm:text-[1.18rem]">
                            {offer.title}
                          </h3>
                          <p className="mt-2 max-w-[32rem] text-[0.9rem] leading-6 text-[#5d5650] sm:text-[0.95rem]">
                            {offer.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>
      </main>

      <Footer tone="feature" />
    </div>
  );
}
