import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";

const audiences = [
  {
    title: "SaaS",
    body: "Recurring and one-time local payments.",
  },
  {
    title: "Marketplaces",
    body: "Merchant settlement from one payment flow.",
  },
  {
    title: "Fintechs",
    body: "Payment APIs, webhooks, and stable settlement.",
  },
  {
    title: "Global merchants",
    body: "Enter local markets without rebuilding operations.",
  },
] as const;

export function WhoWeServeSection() {
  return (
    <section id="who-we-serve" className="bg-[#fbfbfa] py-20 sm:py-24 lg:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
          <Reveal offset={22}>
            <h2 className="max-w-[11ch] font-display text-[clamp(3rem,7vw,5.2rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
              For teams collecting across local markets.
            </h2>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-2">
            {audiences.map((audience, index) => (
              <Reveal key={audience.title} offset={18} delay={index * 0.05}>
                <div className="min-h-[9rem] rounded-xl border border-black/8 bg-white p-5">
                  <h3 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#111111]">
                    {audience.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#66706a]">
                    {audience.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
