import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { FiatTicker } from "@/components/landing/fiat-ticker";
import { GetStartedButton } from "@/components/shared/get-started";
import { ButtonLink } from "@/components/ui/button";
import { CurrencyNetwork } from "@/components/landing/currency-network";
import { supportedBillingCurrencies } from "@/lib/content";

export function Hero() {
  return (
    <section className="bg-[#e8f5e9] pt-[12vh] sm:pt-[14vh] lg:pt-[16vh]">
      <Container className="w-full">
        <div className="w-full max-w-[39rem]">
          <Reveal delay={0.05}>
            <h1 className="font-display leading-[0.92] tracking-[-0.04em] text-[#111111]">
              <FiatTicker
                currencies={supportedBillingCurrencies}
                className="block text-[clamp(2.05rem,4.8vw,3.55rem)]"
              />
              <span className="block text-[clamp(1.9rem,4.3vw,3.2rem)]">
                Settle in USDC.
              </span>
            </h1>
          </Reveal>

          <Reveal className="mt-7 flex flex-row flex-wrap items-center gap-3" delay={0.1}>
            <GetStartedButton className="h-8 gap-2 px-4">
              <span>Get started</span>
              <span aria-hidden="true" className="text-sm leading-none">
                →
              </span>
            </GetStartedButton>
            <ButtonLink href="/docs" variant="secondary" className="h-8 px-4">
              View docs
            </ButtonLink>
          </Reveal>
        </div>
      </Container>

      <div className="mt-10 sm:mt-14 lg:mt-16 pb-8 sm:pb-12">
        <Container>
          <CurrencyNetwork />
        </Container>
      </div>
    </section>
  );
}
