"use client";

import type { ReactNode } from "react";
import { useRef } from "react";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

type Feature = {
  title: string;
  body: string;
  icon: ReactNode;
};

const BillingStackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
    <rect x="3" y="3" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M3 8.5H21" stroke="currentColor" strokeWidth="1.7" />
    <rect x="5.5" y="11" width="5" height="2.5" rx="0.75" fill="currentColor" opacity="0.25" />
    <path d="M14 12.25H18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.35" />
    <rect x="5" y="19" width="14" height="2.5" rx="1.25" stroke="currentColor" strokeWidth="1.4" opacity="0.3" />
    <path d="M8 16V19" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />
    <path d="M16 16V19" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />
  </svg>
);

const AccountAbstractionIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.4" opacity="0.3" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.35" />
    <path d="M12 3V6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M12 18V21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M3 12H6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M18 12H21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M5.64 5.64L7.76 7.76" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />
    <path d="M16.24 16.24L18.36 18.36" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />
  </svg>
);

const ZeroGasIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
    <path d="M13 3L6 13H11.5L10 21L18 11H12.5L13 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M13 3L6 13H11.5L10 21L18 11H12.5L13 3Z" fill="currentColor" opacity="0.08" />
    <path d="M4 20L3 21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.2" />
    <path d="M6.5 19L5.5 20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.15" />
    <path d="M20 20L21 21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.2" />
    <path d="M17.5 19L18.5 20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.15" />
  </svg>
);

const TreasuryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
    <rect x="3" y="9" width="18" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M6 9V7.5C6 5.84 7.34 4.5 9 4.5H15C16.66 4.5 18 5.84 18 7.5V9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M3 14H8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="10" cy="14" r="2" stroke="currentColor" strokeWidth="1.5" />
    <rect x="15" y="12.5" width="4" height="3" rx="1" fill="currentColor" opacity="0.2" />
    <path d="M10 4.5V2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.25" />
    <path d="M14 4.5V3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.25" />
  </svg>
);

const GovernanceIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
    <path d="M12 3L20 7V12C20 16.4 16.5 20.2 12 21C7.5 20.2 4 16.4 4 12V7L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M12 3L20 7V12C20 16.4 16.5 20.2 12 21C7.5 20.2 4 16.4 4 12V7L12 3Z" fill="currentColor" opacity="0.06" />
    <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="7" r="1" fill="currentColor" opacity="0.25" />
  </svg>
);

const DeveloperIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
    <rect x="3" y="4" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8 9L5.5 11.5L8 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 9L18.5 11.5L16 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 8L11 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="8" cy="20.5" r="1" fill="currentColor" opacity="0.25" />
    <circle cx="12" cy="20.5" r="1" fill="currentColor" opacity="0.25" />
    <circle cx="16" cy="20.5" r="1" fill="currentColor" opacity="0.25" />
  </svg>
);

const features: Feature[] = [
  {
    title: "Complete billing stack",
    body: "Subscriptions, invoices, and hosted checkout in one place. Bill customers in 13+ African currencies from a single integration.",
    icon: <BillingStackIcon />,
  },
  {
    title: "Abstracted wallet experience",
    body: "No seed phrases, no wallet pop-ups. Merchants manage billing, approvals, and payouts through a fully abstracted treasury experience.",
    icon: <AccountAbstractionIcon />,
  },
  {
    title: "Abstracted network fees",
    body: "Renew handles network fees and transaction execution in the background, so merchants and customers never deal with gas.",
    icon: <ZeroGasIcon />,
  },
  {
    title: "Treasury & payouts",
    body: "Track stablecoin settlement and withdraw available balance to your approved payout wallet.",
    icon: <TreasuryIcon />,
  },
  {
    title: "Multisig governance",
    body: "Team-based treasury approvals. Every payout action requires the right sign-off before funds move.",
    icon: <GovernanceIcon />,
  },
  {
    title: "Developer-first",
    body: "REST APIs, webhooks, TypeScript SDK, and a sandbox playground. Ship your integration in hours, not weeks.",
    icon: <DeveloperIcon />,
  },
];

const DESKTOP_CARD_HEIGHT = 300;
const DESKTOP_CARD_GAP = 44;
const DESKTOP_CARD_SHIFT = DESKTOP_CARD_HEIGHT + DESKTOP_CARD_GAP;
const DESKTOP_VIEWPORT_HEIGHT = DESKTOP_CARD_HEIGHT * 2 + DESKTOP_CARD_GAP;

function FeatureCard({
  feature,
  className,
}: {
  feature: Feature;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col border-l border-[#e5e7eb] pl-6 sm:pl-8",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-black/8 bg-white/60 text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-sm">
          {feature.icon}
        </div>
        <h3 className="text-[1.8rem] font-medium tracking-[-0.04em] text-[#111111] sm:text-[2.05rem]">
          {feature.title}
        </h3>
      </div>

      <p className="mt-8 max-w-[28ch] text-[1.02rem] leading-8 text-[#8a8f97] sm:text-lg">
        {feature.body}
      </p>
    </div>
  );
}

export function FeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const desktopCardsY = useTransform(
    scrollYProgress,
    [0, 0.72],
    [0, shouldReduceMotion ? 0 : -DESKTOP_CARD_SHIFT],
  );

  return (
    <section
      ref={sectionRef}
      className="bg-[#fdf1e7] py-20 sm:py-28 lg:min-h-[190vh] lg:pb-0 lg:pt-24 xl:pt-32"
    >
      <Container className="lg:hidden">
        <div className="grid gap-12">
          <div className="max-w-[34rem]">
            <h2 className="text-balance font-display text-4xl leading-[0.98] tracking-[-0.04em] text-[#111111] sm:text-[3.35rem]">
              Everything you need to collect and settle.
            </h2>
          </div>

          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 sm:gap-y-14">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                feature={feature}
                className="min-h-[15rem] sm:min-h-[16rem]"
              />
            ))}
          </div>
        </div>
      </Container>

      <div className="hidden lg:block lg:sticky lg:top-28 xl:top-32">
        <Container>
          <div className="grid items-start gap-16 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
            <div className="max-w-[34rem] xl:pt-2">
              <h2 className="text-balance font-display text-[4.25rem] leading-[0.98] tracking-[-0.05em] text-[#111111]">
                Everything you need to collect and settle.
              </h2>
            </div>

            <div
              className="overflow-hidden"
              style={{ height: `${DESKTOP_VIEWPORT_HEIGHT}px` }}
            >
              <motion.div
                className="grid grid-cols-2 gap-x-10"
                style={{ y: desktopCardsY, rowGap: `${DESKTOP_CARD_GAP}px` }}
              >
                {features.map((feature) => (
                  <FeatureCard
                    key={feature.title}
                    feature={feature}
                    className="h-[300px]"
                  />
                ))}
              </motion.div>
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}
