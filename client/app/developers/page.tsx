import type { Metadata } from "next";
import { Suspense } from "react";

import { CodeBlock } from "@/components/docs/code-block";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/shared/header";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
const sdkSnippet = `import { createRenewServerClient } from "@renew.sh/sdk/server";

const renew = createRenewServerClient({
  apiKey: process.env.RENEW_SECRET_KEY!,
  environment: "sandbox",
});

const session = await renew.checkout.sessions.create({
  planId: "plan_basic_ngn",
  customer: {
    email: "ada@example.com",
    fullName: "Ada Lovelace",
  },
  successUrl: "https://app.renew.sh/payments/success",
  cancelUrl: "https://app.renew.sh/payments/cancelled",
});`;

export const metadata: Metadata = {
  title: "Renew Developers | SDKs, APIs, and Checkout Flows",
  description:
    "Build with Renew using SDKs, direct APIs, hosted checkout, and public docs for sandbox and live billing flows.",
};

export default function DevelopersPage() {
  return (
    <div className="page-shell flex min-h-screen flex-col bg-[#e8f5e9]">
      <Suspense fallback={null}>
        <Header tone="hero" />
      </Suspense>

      <main className="flex-1">
        <section className="overflow-hidden pb-16 pt-12 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20">
          <Container>
            <Reveal offset={28}>
              <div className="grid lg:grid-cols-[minmax(0,0.94fr)_1px_minmax(0,1.06fr)]">
                <div className="px-7 py-9 sm:px-10 sm:py-12 lg:flex lg:items-center lg:px-14 lg:py-16">
                  <div className="mx-auto w-full max-w-[32rem]">
                    <span className="inline-flex h-11 items-center rounded-full bg-[#111111] px-5 text-[0.74rem] font-semibold uppercase tracking-[0.18em] text-white">
                      SDK + API
                    </span>
                    <h1 className="mt-8 max-w-[11ch] font-display text-[clamp(2.8rem,5.8vw,4.9rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
                      Build billing flows without rebuilding the stack.
                    </h1>

                    <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                      <ButtonLink href="/docs" className="h-12 px-6 text-[0.95rem]">
                        Read docs
                      </ButtonLink>
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

                <div className="h-px bg-black/8 lg:hidden" />
                <div className="hidden lg:block bg-black/8" />

                <div className="px-7 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
                  <div className="mx-auto w-full max-w-[34rem]">
                    <CodeBlock
                      label="SDK quickstart"
                      language="ts"
                      code={sdkSnippet}
                      className="mt-0"
                    />
                  </div>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>
      </main>

      <Footer tone="hero" />
    </div>
  );
}
