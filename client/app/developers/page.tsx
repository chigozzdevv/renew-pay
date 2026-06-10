import type { Metadata } from "next";
import { Suspense } from "react";

import { CodeBlock } from "@/components/docs/code-block";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/shared/header";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
const sdkSnippet = `import { renew } from "@renew.sh/sdk";

const client = renew({
  secretKey: process.env.RENEW_SECRET_KEY!,
});

const collection = await client.collections.create({
  amount: 25000,
  currency: "NGN",
  reference: "order_1042",
  description: "Order #1042",
  items: [
    { name: "Everyday Tote", amount: 12500, quantity: 2 },
  ],
});

return collection.checkoutUrl;`;

export const metadata: Metadata = {
  title: "Renew Developers | APIs",
  description:
    "Build with Renew using collection APIs, checkout links, and stable settlement.",
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
                    <h1 className="max-w-[12ch] font-display text-[clamp(2.8rem,5.8vw,4.9rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
                      One API, Unified Fiat Collection
                    </h1>

                    <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                      <ButtonLink href="/docs" className="h-12 px-6 text-[0.95rem]">
                        Read docs
                      </ButtonLink>
                      <ButtonLink
                        href="/signup"
                        variant="secondary"
                        className="h-12 border-black/8 bg-white/58 px-6 text-[0.95rem] hover:bg-white/76"
                      >
                        Start testing
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
