"use client";

import { useSearchParams } from "next/navigation";

import { Footer } from "@/components/landing/footer";
import { GetStartedButton } from "@/components/shared/get-started";
import { Header } from "@/components/shared/header";
import { Reveal } from "@/components/ui/reveal";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

type ProductType = "subscription" | "invoice";

type ProductStep = {
  title: string;
  body: string;
};

type ProductConfig = {
  title: string;
  body: string;
  listIntro?: string;
  pageClassName: string;
  headerTone: "default" | "hero" | "feature";
  footerTone: "default" | "hero" | "feature";
  steps: ProductStep[];
};

const productConfigs: Record<ProductType, ProductConfig> = {
  subscription: {
    title: "Recurring billing, made easy.",
    body: "",
    listIntro:
      "Create plans faster, integrate Renew Checkout into your product, and collect local fiat while settlement stays in stablecoins.",
    pageClassName: "bg-[#e8f5e9]",
    headerTone: "hero",
    footerTone: "hero",
    steps: [
      {
        title: "Create a plan",
        body: "Set pricing, intervals, and the billing markets you want to support.",
      },
      {
        title: "Integrate Renew Checkout",
        body: "Launch hosted checkout from your app with an active plan and customer context.",
      },
      {
        title: "Collect and settle",
        body: "Accept local payments and keep recurring billing tied back to stablecoin settlement.",
      },
    ],
  },
  invoice: {
    title: "Send invoices, collect faster.",
    body: "",
    listIntro:
      "Generate hosted invoices, route customers through Renew Checkout, and track collection through to stablecoin settlement.",
    pageClassName: "bg-[#f7f9fc]",
    headerTone: "default",
    footerTone: "default",
    steps: [
      {
        title: "Create an invoice",
        body: "Set the amount, due date, and billing market for each invoice flow.",
      },
      {
        title: "Share Renew Checkout",
        body: "Send customers through a hosted payment flow without rebuilding the collection layer.",
      },
      {
        title: "Collect and settle",
        body: "Track payment status through collection, settlement, and reconciliation.",
      },
    ],
  },
};

function resolveProductType(type: string | null): ProductType {
  return type === "invoice" ? "invoice" : "subscription";
}

export function ProductsPageClient() {
  const searchParams = useSearchParams();
  const product = productConfigs[resolveProductType(searchParams.get("type"))];

  return (
    <div className={cn("page-shell flex min-h-screen flex-col", product.pageClassName)}>
      <Header tone={product.headerTone} />

      <main className="flex-1">
        <section className="overflow-hidden pb-20 pt-12 sm:pb-24 sm:pt-16 lg:pb-28 lg:pt-20">
          <Container>
            <Reveal offset={28}>
              <div className="grid lg:grid-cols-[minmax(0,0.94fr)_1px_minmax(0,1.06fr)]">
                <div className="px-7 py-9 sm:px-10 sm:py-12 lg:flex lg:items-center lg:px-14 lg:py-16">
                  <div className="mx-auto w-full max-w-[31rem]">
                    <h1 className="max-w-[11ch] font-display text-[clamp(2.8rem,5.8vw,4.9rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
                      {product.title}
                    </h1>
                    {product.body ? (
                      <p className="mt-6 max-w-[31rem] text-[0.98rem] leading-7 text-[#5d5650] sm:text-[1rem]">
                        {product.body}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="h-px bg-black/8 lg:hidden" />
                <div className="hidden lg:block bg-black/8" />

                <div className="px-7 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
                  <div className="mx-auto w-full max-w-[34rem]">
                    {product.listIntro ? (
                      <p className="mb-6 max-w-[32rem] text-[0.9rem] leading-6 text-[#5d5650] sm:text-[0.95rem]">
                        {product.listIntro}
                      </p>
                    ) : null}

                    <div className="space-y-0">
                      {product.steps.map((step, index) => (
                        <div
                          key={step.title}
                          className={cn(
                            "grid gap-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-5",
                            index > 0 && "border-t border-black/8",
                          )}
                        >
                          <span className="pt-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7a6d63]">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <div>
                            <h2 className="text-[1.08rem] font-medium leading-[1.15] tracking-[-0.02em] text-[#111111] sm:text-[1.18rem]">
                              {step.title}
                            </h2>
                            <p className="mt-2 max-w-[32rem] text-[0.9rem] leading-6 text-[#5d5650] sm:text-[0.95rem]">
                              {step.body}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                      <GetStartedButton className="h-12 px-6 text-[0.95rem]">
                        Start for free
                      </GetStartedButton>
                      <ButtonLink
                        href="/playground"
                        variant="secondary"
                        className="h-12 border-black/8 bg-white/58 px-6 text-[0.95rem] hover:bg-white/76"
                      >
                        Open playground
                      </ButtonLink>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>
      </main>

      <Footer tone={product.footerTone} />
    </div>
  );
}
