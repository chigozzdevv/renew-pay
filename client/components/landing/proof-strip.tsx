import { proofItems } from "@/lib/content";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";

export function ProofStrip() {
  return (
    <section className="pb-20">
      <Container>
        <Reveal className="grid gap-4 rounded-xl border border-[#e5e7eb] bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
          {proofItems.map((item) => (
            <div key={item.label} className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] px-5 py-6">
              <p className="font-display text-4xl tracking-[-0.04em] text-[#111111]">
                {item.value}
              </p>
              <p className="mt-2 text-sm font-medium uppercase tracking-[0.16em] text-[#6b7280]">
                {item.label}
              </p>
            </div>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
