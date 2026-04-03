import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { FiatTicker } from "@/components/landing/fiat-ticker";
import { GetStartedButton } from "@/components/shared/get-started";
import { ButtonLink } from "@/components/ui/button";
import { CurrencyNetwork } from "@/components/landing/currency-network";
import { supportedBillingCurrencies } from "@/lib/content";

export function Hero() {
  return (
    <section className="bg-[#e8f5e9] py-[12vh] sm:py-[14vh] lg:py-[16vh]">
      <Container className="w-full">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-12">
          <div className="w-full shrink-0 lg:flex lg:min-h-[30rem] lg:w-[44%] lg:flex-col lg:justify-center">
            <Reveal delay={0.05}>
              <h1 className="font-display leading-[0.92] tracking-[-0.04em] text-[#111111]">
                <FiatTicker
                  currencies={supportedBillingCurrencies}
                  className="block text-[clamp(2.55rem,6vw,4.5rem)]"
                />
                <span className="block text-[clamp(2.35rem,5.4vw,4.1rem)]">
                  Settle in stablecoins.
                </span>
              </h1>
            </Reveal>

            <Reveal className="mt-7 flex flex-row flex-wrap items-center gap-3" delay={0.1}>
              <GetStartedButton className="h-10 gap-2.5 px-5 text-[0.95rem]">
                <span>Get started</span>
                <span aria-hidden="true" className="text-sm leading-none">
                  →
                </span>
              </GetStartedButton>
              <ButtonLink href="/docs" variant="secondary" className="h-10 px-5 text-[0.95rem]">
                View docs
              </ButtonLink>
            </Reveal>
          </div>

          <div className="mt-12 w-full lg:mt-0 lg:w-[56%]">
            <CurrencyNetwork />
          </div>
        </div>
      </Container>
    </section>
  );
}
