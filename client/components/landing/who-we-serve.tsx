import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";

type Audience = {
  title: string;
  body: string;
  accent: string;
  art: ReactNode;
};

const SaaSTrace = () => (
  <svg viewBox="0 0 160 160" fill="none" className="h-full w-full">
    <rect x="16" y="24" width="96" height="72" rx="10" stroke="currentColor" strokeWidth="1.6" />
    <path d="M16 40H112" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="28" cy="32" r="2.5" fill="currentColor" opacity="0.5" />
    <circle cx="36" cy="32" r="2.5" fill="currentColor" opacity="0.5" />
    <circle cx="44" cy="32" r="2.5" fill="currentColor" opacity="0.5" />
    <rect x="28" y="72" width="10" height="16" rx="2" fill="currentColor" opacity="0.2" transform="rotate(180 33 80)" />
    <rect x="44" y="60" width="10" height="28" rx="2" fill="currentColor" opacity="0.3" transform="rotate(180 49 74)" />
    <rect x="60" y="52" width="10" height="36" rx="2" fill="currentColor" opacity="0.4" transform="rotate(180 65 70)" />
    <rect x="76" y="48" width="10" height="40" rx="2" fill="currentColor" opacity="0.25" transform="rotate(180 81 68)" />
    <circle cx="132" cy="46" r="14" stroke="currentColor" strokeWidth="1.6" strokeDasharray="6 4" opacity="0.35" />
    <path d="M138 34L142 38L138 42" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    <rect x="48" y="108" width="80" height="40" rx="8" stroke="currentColor" strokeWidth="1.6" />
    <path d="M58 120H98" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
    <path d="M58 130H82" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.25" />
    <rect x="104" y="118" width="14" height="14" rx="3" fill="currentColor" opacity="0.15" />
    <path d="M64 96L64 108" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 4" opacity="0.35" />
  </svg>
);

const PlatformTrace = () => (
  <svg viewBox="0 0 160 160" fill="none" className="h-full w-full">
    <circle cx="80" cy="80" r="20" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="80" cy="80" r="8" fill="currentColor" opacity="0.2" />
    <circle cx="32" cy="36" r="12" stroke="currentColor" strokeWidth="1.6" />
    <rect x="26" y="32" width="12" height="8" rx="2" fill="currentColor" opacity="0.2" />
    <circle cx="128" cy="36" r="12" stroke="currentColor" strokeWidth="1.6" />
    <rect x="122" y="32" width="12" height="8" rx="2" fill="currentColor" opacity="0.2" />
    <circle cx="32" cy="128" r="12" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="32" cy="126" r="4" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
    <path d="M24 136C24 132 28 130 32 130C36 130 40 132 40 136" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
    <circle cx="128" cy="128" r="12" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="128" cy="126" r="4" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
    <path d="M120 136C120 132 124 130 128 130C132 130 136 132 136 136" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
    <path d="M44 46L62 66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    <path d="M116 46L98 66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    <path d="M44 118L62 98" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    <path d="M116 118L98 98" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    <circle cx="53" cy="56" r="2" fill="currentColor" opacity="0.35" />
    <circle cx="107" cy="56" r="2" fill="currentColor" opacity="0.35" />
    <circle cx="53" cy="108" r="2" fill="currentColor" opacity="0.35" />
    <circle cx="107" cy="108" r="2" fill="currentColor" opacity="0.35" />
  </svg>
);

const FintechTrace = () => (
  <svg viewBox="0 0 160 160" fill="none" className="h-full w-full">
    <rect x="20" y="20" width="120" height="84" rx="10" stroke="currentColor" strokeWidth="1.6" />
    <path d="M20 36H140" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="32" cy="28" r="2.5" fill="currentColor" opacity="0.5" />
    <circle cx="40" cy="28" r="2.5" fill="currentColor" opacity="0.5" />
    <path d="M34 48L46 56L34 64" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    <path d="M54 64H86" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.3" />
    <path d="M42 76H74" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.25" />
    <path d="M42 88H62" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.2" />
    <circle cx="124" cy="28" r="3" fill="currentColor" opacity="0.35" />
    <path d="M100 76C112 76 120 82 120 92V114" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M116 110L120 118L124 110" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="20" y="118" width="52" height="26" rx="6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M30 131H62" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />
    <rect x="80" y="118" width="52" height="26" rx="6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M90 131H122" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />
    <circle cx="46" cy="118" r="2" fill="currentColor" opacity="0.3" />
  </svg>
);

const MerchantTrace = () => (
  <svg viewBox="0 0 160 160" fill="none" className="h-full w-full">
    <circle cx="80" cy="72" r="44" stroke="currentColor" strokeWidth="1.6" />
    <ellipse cx="80" cy="72" rx="22" ry="44" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
    <path d="M36 72H124" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />
    <path d="M42 54C56 60 68 62 80 62C92 62 104 60 118 54" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.25" />
    <path d="M42 90C56 84 68 82 80 82C92 82 104 84 118 90" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.25" />
    <circle cx="56" cy="60" r="5" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="102" cy="78" r="5" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="72" cy="88" r="5" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.2" />
    <path d="M80 116V128" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M76 124L80 130L84 124" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="32" y="132" width="96" height="20" rx="6" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="48" cy="142" r="5" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
    <path d="M47 140V144" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
    <path d="M62 142H116" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />
  </svg>
);

const audiences: Audience[] = [
  {
    title: "SaaS and software teams",
    body: "Run subscriptions and invoices across multiple markets without rebuilding billing for each one.",
    accent: "#8db7ff",
    art: <SaaSTrace />,
  },
  {
    title: "Platforms and marketplaces",
    body: "Collect local fiat from customers and manage settlement, treasury, and payouts from one system.",
    accent: "#82d1ff",
    art: <PlatformTrace />,
  },
  {
    title: "Fintech and infrastructure teams",
    body: "Embed billing, local collection, and stablecoin settlement into your product with APIs and webhooks.",
    accent: "#b1a1ff",
    art: <FintechTrace />,
  },
  {
    title: "Global merchants",
    body: "Expand into fiat-first markets while keeping treasury and settlement in stablecoins.",
    accent: "#ffb387",
    art: <MerchantTrace />,
  },
];

function AudienceCard({ audience }: { audience: Audience }) {
  return (
    <div className="group relative flex h-full min-h-[17.5rem] flex-col overflow-hidden border border-white/8 bg-[#171716] px-6 py-6 sm:min-h-[18.5rem] sm:px-7 sm:py-7 lg:h-[19.75rem] lg:min-h-0">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(circle at 110% 110%, ${audience.accent}14 0%, transparent 40%)`,
        }}
      />
      <div className="relative z-10 flex h-full flex-col">
        <h3 className="max-w-[14ch] pr-28 font-display text-[1.8rem] leading-[0.94] tracking-[-0.05em] text-white sm:text-[2.15rem]">
          {audience.title}
        </h3>
        <p className="mt-4 max-w-[25ch] text-[0.98rem] leading-7 text-white/68 sm:text-base">
          {audience.body}
        </p>
        <div className="pointer-events-none absolute bottom-6 right-6 z-10 h-28 w-28 text-white/18 sm:bottom-7 sm:right-7 sm:h-32 sm:w-32">
          {audience.art}
        </div>
      </div>
    </div>
  );
}

export function WhoWeServeSection() {
  return (
    <section id="who-we-serve" className="bg-[#eef4ff] py-20 sm:py-28 lg:py-32">
      <Container>
        <div className="max-w-[56rem]">
          <Reveal offset={22}>
            <span className="inline-flex h-12 items-center rounded-full bg-[#111111] px-6 text-sm font-medium uppercase tracking-[0.16em] text-white">
              Who we serve
            </span>
          </Reveal>

          <Reveal offset={28} delay={0.04}>
            <h2 className="mt-8 max-w-[12ch] font-display text-[clamp(3rem,7vw,5.6rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
              Built for teams billing in fiat-first markets.
            </h2>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-4 lg:grid-cols-2 lg:gap-5">
          {audiences.map((audience, index) => (
            <Reveal key={audience.title} className="h-full" offset={24} delay={0.06 * index}>
              <AudienceCard audience={audience} />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
