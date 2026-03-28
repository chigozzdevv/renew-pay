"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  useMotionValueEvent,
} from "framer-motion";

import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";

const PlanIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9 sm:h-10 sm:w-10">
    <rect x="9" y="12" width="30" height="28" rx="5" stroke="currentColor" strokeWidth="2" />
    <path d="M9 20h30" stroke="currentColor" strokeWidth="2" />
    <path d="M18 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M30 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <rect x="15" y="25" width="6" height="4" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="25" y="25" width="6" height="4" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="15" y="32" width="6" height="4" rx="1" fill="currentColor" opacity="0.2" />
    <rect x="25" y="32" width="6" height="4" rx="1" fill="currentColor" opacity="0.45" />
  </svg>
);

const CollectIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9 sm:h-10 sm:w-10">
    <circle cx="24" cy="24" r="15" stroke="currentColor" strokeWidth="2" />
    <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    <path d="M24 14v20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M20 19c0-2.5 1.8-4 4-4s4 1.5 4 4c0 2-1.5 3-4 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M28 29c0 2.5-1.8 4-4 4s-4-1.5-4-4c0-2 1.5-3 4-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SettleIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9 sm:h-10 sm:w-10">
    <circle cx="24" cy="24" r="15" stroke="currentColor" strokeWidth="2" />
    <path d="M16 24l5 5 11-11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M24 9v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
    <path d="M24 37v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
    <path d="M9 24h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
    <path d="M37 24h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
  </svg>
);

const WithdrawIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9 sm:h-10 sm:w-10">
    <rect x="7" y="14" width="34" height="22" rx="5" stroke="currentColor" strokeWidth="2" />
    <path d="M7 22h12a3 3 0 0 1 0 6H7" stroke="currentColor" strokeWidth="2" />
    <circle cx="19" cy="25" r="1.5" fill="currentColor" opacity="0.5" />
    <path d="M31 20v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M27 26l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 14v-3a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
  </svg>
);

type FlowStep = {
  id: string;
  step: string;
  title: string;
  body: string;
  accentColor: string;
  inkColor: string;
  bodyColor: string;
  iconColor: string;
  badgeBackground: string;
  badgeTextColor: string;
  iconBadgeBackground: string;
  icon: ReactNode;
};

const flowSteps: FlowStep[] = [
  {
    id: "plan",
    step: "01",
    title: "Create plan",
    body: "Set pricing for subscriptions or invoices and choose the markets you want to bill in.",
    accentColor: "#249a68",
    inkColor: "#ffffff",
    bodyColor: "rgba(255,255,255,0.65)",
    iconColor: "#ffffff",
    badgeBackground: "rgba(255,255,255,0.2)",
    badgeTextColor: "#ffffff",
    iconBadgeBackground: "rgba(255,255,255,0.15)",
    icon: <PlanIcon />,
  },
  {
    id: "collect",
    step: "02",
    title: "Collect fiat",
    body: "Charge customers in local fiat while Renew handles quotes, collection, and payment status.",
    accentColor: "#4669f0",
    inkColor: "#ffffff",
    bodyColor: "rgba(255,255,255,0.65)",
    iconColor: "#ffffff",
    badgeBackground: "rgba(255,255,255,0.2)",
    badgeTextColor: "#ffffff",
    iconBadgeBackground: "rgba(255,255,255,0.15)",
    icon: <CollectIcon />,
  },
  {
    id: "settle",
    step: "03",
    title: "Settle in USDC",
    body: "Successful payments are reconciled and recorded on Solana in USDC.",
    accentColor: "#7a5af5",
    inkColor: "#ffffff",
    bodyColor: "rgba(255,255,255,0.65)",
    iconColor: "#ffffff",
    badgeBackground: "rgba(255,255,255,0.2)",
    badgeTextColor: "#ffffff",
    iconBadgeBackground: "rgba(255,255,255,0.15)",
    icon: <SettleIcon />,
  },
  {
    id: "withdraw",
    step: "04",
    title: "Withdraw to wallet",
    body: "Move available USDC to your approved payout wallet on your schedule.",
    accentColor: "#eef4ff",
    inkColor: "#111111",
    bodyColor: "rgba(17,17,17,0.62)",
    iconColor: "#111111",
    badgeBackground: "rgba(17,17,17,0.08)",
    badgeTextColor: "#111111",
    iconBadgeBackground: "rgba(255,255,255,0.78)",
    icon: <WithdrawIcon />,
  },
];

const PHONE_W = 380;
const BEZEL = 6;
const CARD_W = PHONE_W - BEZEL * 2;
const CARD_GAP = 28;
const PHONE_H = 520;
const STEP_TRACK_END = 0.74;
const EXPANSION_START = 0.78;
const EXPANSION_END = 0.96;
const EXTRA_SCROLL_SCREENS = 1.8;

function FlowCardContent({ step }: { step: FlowStep }) {
  return (
    <>
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl sm:h-[72px] sm:w-[72px] sm:rounded-[20px]"
        style={{
          backgroundColor: step.iconBadgeBackground,
          color: step.iconColor,
        }}
      >
        {step.icon}
      </div>
      <span
        className="mt-5 inline-flex h-7 items-center rounded-full px-3.5 text-[10px] font-bold uppercase tracking-[0.15em] sm:text-[11px]"
        style={{
          backgroundColor: step.badgeBackground,
          color: step.badgeTextColor,
        }}
      >
        Step {step.step}
      </span>
      <h4
        className="mt-5 text-[22px] font-semibold tracking-[-0.03em] sm:text-[26px]"
        style={{ color: step.inkColor }}
      >
        {step.title}
      </h4>
      <p
        className="mt-3 max-w-[24ch] text-sm leading-6 sm:text-[15px] sm:leading-6"
        style={{ color: step.bodyColor }}
      >
        {step.body}
      </p>
    </>
  );
}

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const totalSteps = flowSteps.length;
  const finalStep = flowSteps[flowSteps.length - 1];
  const stepProgress = useTransform(scrollYProgress, [0, STEP_TRACK_END], [0, totalSteps - 0.01]);
  const expansionProgress = useTransform(scrollYProgress, [EXPANSION_START, EXPANSION_END], [0, 1]);
  const introOpacity = useTransform(expansionProgress, [0, 0.16, 0.3], [1, 1, 0]);
  const introY = useTransform(expansionProgress, [0, 0.3], [0, -40]);
  const stripOpacity = useTransform(expansionProgress, [0, 0.06, 0.18], [1, 1, 0]);
  const frameOpacity = useTransform(expansionProgress, [0, 0.08, 0.2], [1, 1, 0]);
  const frameScale = useTransform(expansionProgress, [0, 0.2], [1, 0.97]);
  const overlayOpacity = useTransform(
    scrollYProgress,
    [EXPANSION_START, EXPANSION_START + 0.04, 0.92, 0.985, 1],
    [0, 1, 1, 0.28, 0],
  );
  const overlayContentOpacity = useTransform(
    scrollYProgress,
    [EXPANSION_START, EXPANSION_START + 0.05, 0.9, 0.96],
    [0, 1, 1, 0],
  );
  const overlayScale = useTransform(expansionProgress, [0, 1], [1, shouldReduceMotion ? 1.35 : 4.6]);
  const overlayRotate = useTransform(
    expansionProgress,
    [0, 0.55, 1],
    [0, shouldReduceMotion ? 0 : -10, shouldReduceMotion ? 0 : -7],
  );
  const overlayX = useTransform(expansionProgress, [0, 1], [0, shouldReduceMotion ? 0 : 26]);
  const overlayY = useTransform(expansionProgress, [0, 1], [0, shouldReduceMotion ? 20 : 250]);
  const overlayRadius = useTransform(expansionProgress, [0, 0.7, 1], [38, 18, 0]);
  const overlayShadow = useTransform(
    expansionProgress,
    [0, 0.35, 1],
    [
      "0 32px 90px rgba(17,17,17,0.18)",
      "0 60px 160px rgba(17,17,17,0.18)",
      "0 0 0 rgba(17,17,17,0)",
    ],
  );
  const orangeWashOpacity = useTransform(scrollYProgress, [0, 0.9, 1], [0.08, 0.08, 0]);

  useMotionValueEvent(stepProgress, "change", (latest) => {
    const newIndex = Math.min(Math.floor(latest), totalSteps - 1);
    setActiveIndex(Math.max(0, newIndex));
  });

  // Shift amount: move strip left so active card centers behind the phone
  const stripX = -(activeIndex * (CARD_W + CARD_GAP));

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ minHeight: `${(totalSteps + EXTRA_SCROLL_SCREENS) * 100}vh` }}
    >
      <div className="sticky top-0 flex min-h-svh flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[#eef4ff]" />
        <motion.div
          className="pointer-events-none absolute inset-0 z-0 bg-[#f47c3c]"
          style={{ opacity: orangeWashOpacity }}
        />

        <div className="relative z-10 flex flex-1 flex-col items-center pt-20 sm:pt-24">
          <Container>
            <Reveal offset={28}>
              <motion.div
                className="mx-auto max-w-3xl text-center"
                style={{ opacity: introOpacity, y: introY }}
              >
                <h2 className="text-balance font-display text-4xl leading-[1] tracking-[-0.03em] text-[#111111] sm:text-[3.2rem]">
                  From local collection to USDC settlement.
                </h2>
              </motion.div>
            </Reveal>
          </Container>

          {/* Phone + cards area */}
          <div
            className="relative mt-10 flex w-full flex-1 items-start justify-center sm:mt-14"
            style={{ minHeight: PHONE_H + 40 }}
          >
            {/* ── Card strip — one continuous row, all cards always visible ── */}
            <motion.div
              className="absolute flex items-start"
              style={{
                top: BEZEL,
                left: "50%",
                marginLeft: -(CARD_W / 2),
                gap: CARD_GAP,
                opacity: stripOpacity,
              }}
              animate={{ x: stripX }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              {flowSteps.map((step) => (
                <div
                  key={step.id}
                  className="flex shrink-0 flex-col items-center justify-center rounded-t-[2.4rem] rounded-b-none p-6 text-center"
                  style={{
                    width: CARD_W,
                    height: PHONE_H - BEZEL * 2,
                    backgroundColor: step.accentColor,
                  }}
                >
                  <FlowCardContent step={step} />
                </div>
              ))}
            </motion.div>

            <motion.div
              className="pointer-events-none absolute z-30 flex flex-col items-center justify-center p-6 text-center"
              style={{
                top: BEZEL,
                left: "50%",
                width: CARD_W,
                height: PHONE_H - BEZEL * 2,
                marginLeft: -(CARD_W / 2),
                backgroundColor: finalStep.accentColor,
                color: finalStep.inkColor,
                opacity: overlayOpacity,
                scale: overlayScale,
                rotate: overlayRotate,
                x: overlayX,
                y: overlayY,
                borderTopLeftRadius: overlayRadius,
                borderTopRightRadius: overlayRadius,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                boxShadow: overlayShadow,
                transformOrigin: "center center",
              }}
            >
              <motion.div style={{ opacity: overlayContentOpacity }}>
                <FlowCardContent step={finalStep} />
              </motion.div>
            </motion.div>

            {/* ── Phone frame overlay — border only, transparent center ── */}
            <motion.div
              className="pointer-events-none relative z-20 rounded-t-[2.8rem] border-[6px] border-b-0 border-[#1a1a1a]"
              style={{
                width: PHONE_W,
                height: PHONE_H,
                boxShadow: "0 40px 100px rgba(17,17,17,0.18)",
                opacity: frameOpacity,
                scale: frameScale,
              }}
            >
              {/* Dynamic island */}
              <div className="absolute left-1/2 top-[8px] z-30 -translate-x-1/2">
                <div className="h-[1.5rem] w-[5.5rem] rounded-full bg-[#1a1a1a]" />
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
