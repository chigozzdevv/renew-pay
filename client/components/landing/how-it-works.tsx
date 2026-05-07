import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";

const merchantItems = [
  {
    title: "No wallet friction",
    body: "Customers pay normally. Merchants do not manage onchain complexity.",
  },
  {
    title: "Stable by default",
    body: "Completed payments are tracked against stable settlement.",
  },
  {
    title: "Payout control",
    body: "Route settlement to standard or private payout destinations.",
  },
] as const;

const privateFlow = [
  "Customer pays Renew",
  "Renew reconciles payment",
  "Merchant receives privately",
] as const;

export function HowItWorksSection() {
  return (
    <section className="bg-[#f4faf3] py-20 sm:py-24 lg:py-28">
      <Container>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <Reveal offset={22}>
            <div className="h-full rounded-xl bg-[#111111] p-7 text-white sm:p-9 lg:p-10">
              <h2 className="max-w-[12ch] font-display text-[clamp(2.6rem,5.5vw,4.6rem)] leading-[0.94] tracking-[-0.06em]">
                Built for merchants, not crypto operators.
              </h2>

              <div className="mt-10 grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
                {merchantItems.map((item) => (
                  <div key={item.title} className="border-t border-white/12 pt-5">
                    <h3 className="text-base font-semibold tracking-[-0.02em]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/62">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal offset={22} delay={0.06}>
            <div className="h-full rounded-xl border border-black/8 bg-white p-7 sm:p-9 lg:p-10">
              <h2 className="max-w-[12ch] font-display text-[clamp(2.4rem,5vw,4rem)] leading-[0.96] tracking-[-0.06em] text-[#111111]">
                Private settlement when needed.
              </h2>
              <p className="mt-6 max-w-[30rem] text-[1rem] leading-7 text-[#66706a]">
                Renew can settle USDC through Umbra private routes, reducing the public link between customer payments and merchant wallets.
              </p>

              <div className="mt-10 grid gap-3">
                {privateFlow.map((item, index) => (
                  <div
                    key={item}
                    className="flex items-center gap-4 rounded-lg border border-black/8 bg-[#fbfbfa] px-4 py-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#111111] text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-[#111111]">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
