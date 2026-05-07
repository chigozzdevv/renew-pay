import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { GetStartedButton } from "@/components/shared/get-started";

export function CTASection() {
  return (
    <section id="enterprise" className="bg-[#fbfbfa] pb-14 pt-4 sm:pb-18 sm:pt-6">
      <Container>
        <Reveal offset={24}>
          <div className="relative overflow-hidden rounded-xl bg-[#111111] px-7 py-9 shadow-[0_22px_90px_rgba(18,32,22,0.12)] sm:px-10 sm:py-11 lg:px-12 lg:py-12">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <svg
                viewBox="0 0 720 220"
                fill="none"
                aria-hidden="true"
                className="w-[50%] max-w-[24rem] opacity-95 lg:w-[31%]"
                preserveAspectRatio="xMidYMid meet"
              >
                <path
                  d="M40 156C142 70 242 30 348 40C411 46 463 86 461 129C458 174 400 177 394 136C388 85 458 66 524 86C584 104 623 115 670 89"
                  stroke="#6bc28e"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M656 74L680 89L662 112"
                  stroke="#6bc28e"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="relative z-10 grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
              <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
                <h2 className="mx-auto max-w-[9ch] text-balance font-display text-[clamp(2.8rem,6vw,4.2rem)] leading-[0.95] tracking-[-0.05em] text-white lg:mx-0">
                  Start collecting locally.
                </h2>
                <p className="mt-4 text-sm font-medium text-white/58">
                  Create collections, collect fiat, settle stable.
                </p>
              </div>

              <div className="mx-auto flex flex-row flex-wrap items-center justify-center gap-3 lg:mx-0 lg:flex-col lg:items-end lg:justify-start">
                <GetStartedButton
                  variant="ghost"
                  className="!bg-[#eef4ff] !px-6 !py-3 !text-[#111111] shadow-[0_14px_30px_rgba(0,0,0,0.18)] ring-1 ring-white/30 hover:!bg-[#dfe9ff] sm:!px-7 sm:!py-3.5"
                >
                  Get started
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
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
