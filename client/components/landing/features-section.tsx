import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";

const flowItems = [
  {
    label: "Create",
    title: "Payment link or API",
    body: "Amount, currency, description, settlement route.",
  },
  {
    label: "Collect",
    title: "Local fiat methods",
    body: "Customers pay locally through supported methods.",
  },
  {
    label: "Settle",
    title: "Stable assets",
    body: "Renew reconciles fees and queues payout.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section className="bg-[#fbfbfa] py-20 sm:py-24 lg:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-end">
          <Reveal offset={22}>
            <div>
              <h2 className="max-w-[11ch] font-display text-[clamp(3rem,7vw,5.2rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
                From payment to settlement.
              </h2>
              <p className="mt-6 max-w-[34rem] text-[1rem] leading-7 text-[#66706a] sm:text-[1.08rem]">
                Create a payment, share a link or use the Renew SDK, and let Renew handle collection, reconciliation, and payout.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-3">
            {flowItems.map((item, index) => (
              <Reveal key={item.label} offset={18} delay={index * 0.05}>
                <div className="h-full rounded-xl border border-black/8 bg-white p-5">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#66706a]">
                    {item.label}
                  </span>
                  <h3 className="mt-5 text-[1.2rem] font-semibold leading-tight tracking-[-0.03em] text-[#111111]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#66706a]">
                    {item.body}
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
