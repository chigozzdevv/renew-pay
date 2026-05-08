"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CheckCircle2,
  Link2,
  Route,
  Send,
  Store,
  WalletCards,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

type FlowVariant = "collect" | "settle" | "payout";

const STEP_FILL_DURATION_MS = 4200;

const flowSteps = [
  {
    title: "Collect",
    description: "Create a collection, let the customer pay locally, and receive a paid event tied to your order.",
    icon: Banknote,
    visual: "collect",
  },
  {
    title: "Settle",
    description: "Renew reconciles paid collections and routes stable value to your selected settlement rail.",
    icon: CheckCircle2,
    visual: "settle",
  },
  {
    title: "Payout",
    description: "Track payout batches as funds land in your standard or private destination.",
    icon: WalletCards,
    visual: "payout",
  },
] as const;

function StepVisual({ activeStepIndex }: { activeStepIndex: number }) {
  return (
    <VisualShell>
      <FlowArtwork variant={flowSteps[activeStepIndex].visual} />
    </VisualShell>
  );
}

function VisualShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-[#d9dfd7] bg-[#fbfdf8]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(17,17,17,0),rgba(47,125,60,0.36),rgba(17,17,17,0))]" />
      <div className="relative flex min-h-[26rem] items-center justify-center px-4 py-6 sm:min-h-[31rem] sm:px-7 sm:py-8 lg:min-h-[34rem]">
        {children}
      </div>
    </div>
  );
}

const flowArtwork = {
  collect: {
    Visual: CollectDiagram,
  },
  settle: {
    Visual: SettleDiagram,
  },
  payout: {
    Visual: PayoutDiagram,
  },
} as const;

function FlowArtwork({ variant }: { variant: FlowVariant }) {
  const artwork = flowArtwork[variant];
  const Visual = artwork.Visual;

  return (
    <div className="w-full max-w-[43rem]">
      <Visual />
    </div>
  );
}

function DiagramIcon({
  icon: Icon,
  tone = "light",
}: {
  icon: LucideIcon;
  tone?: "dark" | "light";
}) {
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
        tone === "dark" ? "bg-white/10 text-white" : "bg-[#edf7ee] text-[#225c39]"
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={2.1} />
    </span>
  );
}

function DetailRow({ label, value, tone }: { label: string; value: string; tone?: "success" | "muted" }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-[#f6faf4] px-3 py-2">
      <span className="min-w-0 truncate text-xs font-medium text-[#6b746e]">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-xs font-semibold text-[#172019]",
          tone === "success" && "text-[#24683b]",
          tone === "muted" && "text-[#727b74]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CollectDiagram() {
  return (
    <div className="mx-auto w-full max-w-[25rem] overflow-hidden rounded-lg border border-[#dfe7dc] bg-white">
      <div className="flex items-center gap-3 border-b border-[#edf1eb] px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <DiagramIcon icon={Store} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#151713]">Acme Store</p>
            <p className="mt-0.5 text-xs font-medium text-[#7a847c]">Order #1042</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 text-center sm:px-6">
        <p className="font-display text-[clamp(2.7rem,11vw,4.3rem)] font-semibold leading-none tracking-[-0.05em] text-[#151713]">
          <span className="text-[#b7b7b7]">₦</span>26,500
        </p>
        <div className="mx-auto mt-4 flex max-w-full items-center gap-2 rounded-lg border border-[#dfe7dc] bg-[#fbfdf8] px-3 py-2 text-left">
          <Link2 className="h-4 w-4 shrink-0 text-[#225c39]" strokeWidth={2.1} />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#3f4a42]">
            renew.sh/pay/pay_7de830ca
          </span>
        </div>
      </div>

      <div className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
        <DetailRow label="Customer pays" value="local transfer" />
        <DetailRow label="Status" value="collection.paid" tone="success" />
        <DetailRow label="Webhook" value="order marked paid" />
      </div>
    </div>
  );
}

function SettleDiagram() {
  return (
    <div className="mx-auto w-full max-w-[34rem] overflow-hidden rounded-lg border border-[#dfe7dc] bg-white p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <DiagramIcon icon={Route} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#151713]">main-wallet</p>
            <p className="mt-0.5 text-xs font-medium text-[#7a847c]">Default USDC route</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="space-y-2">
          <SettlementSource currency="NGN" amount="26,500" reference="pay_1042" />
          <SettlementSource currency="KES" amount="18,400" reference="pay_1043" />
        </div>

        <div className="flex items-center justify-center sm:w-16">
          <div className="grid w-full items-center gap-2 sm:w-auto sm:justify-items-center">
            <span className="h-px w-full bg-[#dfe7dc] sm:h-8 sm:w-px" />
            <span className="rounded-full bg-[#151713] px-3 py-1 text-xs font-semibold text-white">
              Renew
            </span>
            <span className="hidden h-8 w-px bg-[#dfe7dc] sm:block" />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-[#151713] p-4 text-white">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/48">
                USDC
              </p>
              <DiagramIcon icon={WalletCards} tone="dark" />
            </div>
            <p className="mt-3 font-display text-[clamp(2.1rem,7vw,3rem)] font-semibold leading-none tracking-[-0.055em]">
              $16.04
            </p>
            <p className="mt-2 text-sm font-semibold text-white/58">ready for payout</p>
          </div>
        </div>
      </div>

    </div>
  );
}

function SettlementSource({
  currency,
  amount,
  reference,
}: {
  currency: string;
  amount: string;
  reference: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#e4ebe1] bg-[#fbfdf8] px-3 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b746e]">
          {currency}
        </p>
        <p className="mt-1 truncate text-lg font-semibold leading-none text-[#151713]">
          {amount}
        </p>
      </div>
      <div className="min-w-0 text-right">
        <p className="truncate text-xs font-semibold text-[#4f5a52]">{reference}</p>
        <p className="mt-1 text-xs font-medium text-[#24683b]">paid</p>
      </div>
    </div>
  );
}

function PayoutDiagram() {
  return (
    <div className="mx-auto w-full max-w-[29rem] overflow-hidden rounded-lg border border-[#dfe7dc] bg-white">
      <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <DiagramIcon icon={WalletCards} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#151713]">Merchant wallet</p>
            <p className="mt-0.5 text-xs font-medium text-[#7a847c]">main-wallet</p>
          </div>
        </div>
      </div>

      <div className="mx-4 rounded-lg bg-[#151713] p-5 text-white sm:mx-5">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/48">
              Payout batch
            </p>
            <p className="mt-3 font-display text-[clamp(2.4rem,10vw,3.75rem)] font-semibold leading-none tracking-[-0.055em]">
              $16.04
            </p>
            <p className="mt-2 text-sm font-semibold text-white/58">batch_1042</p>
          </div>
          <DiagramIcon icon={Send} tone="dark" />
        </div>
      </div>

      <div className="space-y-2 px-4 py-4 sm:px-5 sm:py-5">
        <DetailRow label="Destination" value="8xQd...42mA" />
        <DetailRow label="Rail" value="standard/private" />
        <DetailRow label="Event" value="settlement.settled" tone="success" />
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [fillCycle, setFillCycle] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setActiveStepIndex((currentIndex) => (currentIndex + 1) % flowSteps.length);
      setFillCycle((currentCycle) => currentCycle + 1);
    }, STEP_FILL_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [activeStepIndex, fillCycle]);

  function handleStepSelect(index: number) {
    setActiveStepIndex(index);
    setFillCycle((currentCycle) => currentCycle + 1);
  }

  return (
    <section className="pb-14 pt-6 sm:pb-16 sm:pt-8 lg:pb-20 lg:pt-10">
      <style>
        {`
          @keyframes renew-step-fill {
            from {
              transform: scaleX(0);
            }
            to {
              transform: scaleX(1);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .renew-step-fill {
              animation: none !important;
              transform: scaleX(1);
            }
          }
        `}
      </style>
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center">
          <Reveal offset={22}>
            <div>
              <h2 className="max-w-[12ch] font-display text-[clamp(2.8rem,6vw,5rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
                <span>How Renew</span>
                <span className="hero-image-text block">Works</span>
              </h2>

              <div className="mt-10 grid max-w-[29rem] gap-3">
                {flowSteps.map((step, index) => {
                  const Icon = step.icon;
                  const active = index === activeStepIndex;

                  return (
                    <button
                      key={step.title}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleStepSelect(index)}
                      className={cn(
                        "group relative isolate flex min-h-14 w-full items-center gap-4 overflow-hidden rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f7d3c]",
                        active
                          ? "border-[#cfd9cd] bg-white"
                          : "border-[#d7ddd5] bg-white hover:bg-[#f6faf4]"
                      )}
                    >
                      {active ? (
                        <span
                          key={`${index}-${fillCycle}`}
                          aria-hidden="true"
                          className="renew-step-fill absolute inset-y-0 left-0 -z-10 w-full origin-left bg-[#eef2ec]"
                          style={{ animation: `renew-step-fill ${STEP_FILL_DURATION_MS}ms linear forwards` }}
                        />
                      ) : null}
                      <Icon className="relative z-10 h-5 w-5 shrink-0 text-[#111111]" strokeWidth={2} />
                      <span className="relative z-10 grid gap-1">
                        <span className="text-base font-semibold tracking-[-0.03em] text-[#333a34]">
                          {step.title}
                        </span>
                        {active ? (
                          <span className="text-sm font-medium leading-5 text-[#68726b]">
                            {step.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Reveal>

          <Reveal offset={22} delay={0.06}>
            <StepVisual activeStepIndex={activeStepIndex} />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
