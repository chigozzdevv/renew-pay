import { Building2, Code2, Globe2, Repeat2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";

const audiences = [
  {
    title: "SaaS",
    body: "Recurring and one-time local payments.",
    icon: Repeat2,
  },
  {
    title: "Marketplaces",
    body: "Collect once, settle merchants cleanly.",
    icon: Building2,
  },
  {
    title: "Fintechs",
    body: "Payment APIs, webhooks, and stable settlement.",
    icon: Code2,
  },
  {
    title: "Global merchants",
    body: "Enter local markets without rebuilding operations.",
    icon: Globe2,
  },
] as const;

export function WhoWeServeSection() {
  return (
    <section id="who-we-serve" className="py-20 sm:py-24 lg:py-[18vh]">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)] lg:items-start lg:gap-16">
          <div className="order-2 grid gap-4 lg:order-1 lg:gap-6">
            {audiences.map((audience, index) => {
              const Icon = audience.icon;

              return (
                <Reveal key={audience.title} offset={18} delay={index * 0.05}>
                  <article className="rounded-lg border border-[#dfe9dd] bg-white p-5 sm:p-6 lg:p-7">
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <div className="min-w-0">
                        <h3 className="text-[1.6rem] font-semibold leading-none tracking-[-0.04em] text-[#111111] sm:text-[1.8rem]">
                          {audience.title}
                        </h3>
                        <p className="mt-4 max-w-[34rem] text-sm leading-6 text-[#66706a] sm:text-[0.98rem]">
                          {audience.body}
                        </p>
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#edf7ee] text-[#225c39]">
                        <Icon className="h-5 w-5" strokeWidth={2.1} />
                      </span>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>

          <Reveal offset={22} className="order-1 lg:sticky lg:top-[30vh] lg:order-2 lg:justify-self-end">
            <div>
              <h2 className="max-w-[11ch] font-display text-[clamp(3rem,7vw,5.2rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
                <span>For teams</span>
                <span className="hero-image-text block">collecting locally.</span>
              </h2>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
