import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { GetStartedButton } from "@/components/shared/get-started";

export function CTASection() {
  return (
    <section id="enterprise" className="bg-[#f47c3c] pb-16 pt-12 sm:pb-20 sm:pt-16">
      <Container>
        <Reveal offset={24}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-8">
            <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
              <h2 className="mx-auto max-w-[11ch] text-balance font-display text-4xl leading-[1] tracking-[-0.03em] text-white sm:text-[3.15rem] lg:mx-0">
                Start billing with Renew.
              </h2>
            </div>

            <div className="mx-auto flex flex-row flex-wrap items-center justify-center gap-3 lg:mx-0 lg:flex-col lg:items-end lg:justify-start">
              <GetStartedButton className="bg-white px-6 py-3 text-[#f47c3c] hover:bg-white/90 sm:px-7 sm:py-3.5">
                Start for free
              </GetStartedButton>
              <ButtonLink href="/docs" variant="secondary" className="border-white/30 bg-transparent px-6 py-3 text-white hover:bg-white/10 sm:px-7 sm:py-3.5">
                View docs
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
