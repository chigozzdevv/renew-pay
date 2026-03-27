import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { GetStartedButton } from "@/components/shared/get-started";

export function CTASection() {
  return (
    <section id="enterprise" className="relative overflow-hidden bg-[#171716] pb-16 pt-12 sm:pb-20 sm:pt-16">
      <div className="pointer-events-none absolute inset-0">
        <svg
          viewBox="0 0 480 260"
          aria-hidden="true"
          className="absolute right-[-5rem] top-[-2rem] h-[16rem] w-[30rem] opacity-90 sm:h-[18rem] sm:w-[34rem]"
        >
          <path
            d="M18 168C76 168 74 74 136 74C198 74 198 176 260 176C322 176 322 74 384 74C426 74 446 118 462 146"
            fill="none"
            stroke="#EEF4FF"
            strokeOpacity="0.26"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M0 132C52 132 54 42 108 42C162 42 162 146 216 146C270 146 270 42 324 42C378 42 380 132 432 132"
            fill="none"
            stroke="#F47C3C"
            strokeOpacity="0.3"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray="3 8"
          />
        </svg>
      </div>
      <Container>
        <Reveal offset={24}>
          <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-8">
            <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
              <h2 className="mx-auto max-w-[11ch] text-balance font-display text-4xl leading-[1] tracking-[-0.03em] text-white sm:text-[3.15rem] lg:mx-0">
                Start billing with Renew.
              </h2>
            </div>

            <div className="mx-auto flex flex-row flex-wrap items-center justify-center gap-3 lg:mx-0 lg:flex-col lg:items-end lg:justify-start">
              <GetStartedButton
                variant="ghost"
                className="!bg-[#eef4ff] !px-6 !py-3 !text-[#111111] shadow-[0_14px_30px_rgba(0,0,0,0.18)] ring-1 ring-white/30 hover:!bg-[#dfe9ff] sm:!px-7 sm:!py-3.5"
              >
                Start for free
              </GetStartedButton>
              <ButtonLink
                href="/docs"
                variant="ghost"
                className="border border-white/18 bg-white/[0.04] px-6 py-3 text-white hover:bg-white/[0.08] sm:px-7 sm:py-3.5"
              >
                View docs
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
