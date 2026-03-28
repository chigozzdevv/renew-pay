"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  type RenewCheckoutPlan,
  type RenewCheckoutSession,
} from "@renew.sh/sdk/core";
import { RenewCheckoutModal } from "@renew.sh/sdk/react";

import { Container } from "@/components/ui/container";
import {
  type PlaygroundCheckoutClient,
  createPlaygroundCheckoutClient,
  createPlaygroundSession,
  listPlaygroundPlans,
  type PlaygroundSessionState,
} from "@/lib/playground";
import { readWorkspaceMode, type WorkspaceMode } from "@/lib/api";

function formatInterval(days: number) {
  if (days % 30 === 0) {
    return `${days / 30} month${days / 30 === 1 ? "" : "s"}`;
  }

  if (days % 7 === 0) {
    return `${days / 7} week${days / 7 === 1 ? "" : "s"}`;
  }

  return `${days} days`;
}

export function PlaygroundPageClient() {
  const [plans, setPlans] = useState<readonly RenewCheckoutPlan[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("test");
  const [selectedPlan, setSelectedPlan] = useState<RenewCheckoutPlan | null>(null);
  const [checkoutClient, setCheckoutClient] = useState<PlaygroundCheckoutClient | null>(null);
  const [session, setSession] = useState<PlaygroundSessionState | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      setWorkspaceMode(readWorkspaceMode());
      setCheckoutClient(createPlaygroundCheckoutClient());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Playground is not configured."
      );
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadPlans = async () => {
      setIsLoadingPlans(true);
      setErrorMessage(null);

      try {
        const nextMode = readWorkspaceMode();
        setWorkspaceMode(nextMode);
        const nextPlans = await listPlaygroundPlans(nextMode);

        if (!isMounted) {
          return;
        }

        setPlans(nextPlans);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load playground."
        );
      } finally {
        if (isMounted) {
          setIsLoadingPlans(false);
        }
      }
    };

    void loadPlans();

    return () => {
      isMounted = false;
    };
  }, []);

  const hasPlans = useMemo(() => plans.length > 0, [plans]);

  const openCheckout = async (plan: RenewCheckoutPlan) => {
    if (!checkoutClient) {
      setErrorMessage("Playground checkout client is not configured.");
      return;
    }

    setSelectedPlan(plan);
    setIsCreatingSession(true);
    setErrorMessage(null);

    try {
      const nextSession = await createPlaygroundSession(plan.id, workspaceMode);
      setSession(nextSession.session);
      setClientSecret(nextSession.clientSecret);
      setIsModalOpen(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to start playground checkout."
      );
    } finally {
      setIsCreatingSession(false);
    }
  };

  const closeCheckout = () => {
    setIsModalOpen(false);
    setSession(null);
    setClientSecret(null);
    setSelectedPlan(null);
  };

  const handleSessionChange = (nextSession: RenewCheckoutSession) => {
    setSession(nextSession);
  };

  const requiresSignIn = errorMessage === "Sign in to your workspace to use Playground.";

  return (
    <>
      <section className="relative overflow-hidden pb-24 pt-14 sm:pb-28 sm:pt-20">
        <Container className="space-y-6">
          {requiresSignIn ? (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="flex min-h-[22rem] h-full flex-col justify-center rounded-[2rem] border border-white/10 bg-[#111111] px-6 py-6 text-white shadow-[0_28px_100px_rgba(8,12,10,0.18)]">
                <div className="space-y-5">
                  {[
                    "Sign in to your Renew workspace.",
                    "Open Playground and choose an active plan or invoice.",
                    "Start the checkout. If invoice, the payment page opens automatically.",
                    "Complete the customer flow and payment steps in test mode.",
                    "Watch the payment and settlement status update in Renew.",
                  ].map((step, index) => (
                    <div key={step} className="flex gap-4">
                      <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d9f6bc] text-sm font-semibold text-[#0c4a27]">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-6 text-white/78">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex min-h-[22rem] h-full flex-col justify-center rounded-[2rem] border border-white/80 bg-white/78 px-6 py-6 shadow-[0_20px_60px_rgba(10,20,12,0.06)]">
                <div>
                  <p className="text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
                    Sign in to use Playground
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                    Open your workspace session first, then test checkout from an active plan.
                  </p>
                </div>
                <div className="mt-6">
                  <Link
                    href="/login?next=/playground"
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[#111111] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#222222]"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          {errorMessage && !requiresSignIn ? (
            <div className="rounded-[1.2rem] border border-[#e7c3bc] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b3b2d]">
              {errorMessage}
            </div>
          ) : null}

          {isLoadingPlans || hasPlans ? (
            <div className="rounded-[2rem] border border-white/80 bg-white/72 p-5 shadow-[0_28px_90px_rgba(10,20,12,0.08)] backdrop-blur-xl">
              <div className="grid gap-5">
                {isLoadingPlans ? (
                  <div className="rounded-[1.6rem] border border-[color:var(--line)] bg-white px-5 py-12 text-center text-sm text-[color:var(--muted)]">
                    Loading active plans...
                  </div>
                ) : null}

                {!isLoadingPlans && hasPlans ? (
                  <>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[color:var(--ink)]">
                        Select a plan
                      </span>
                      <select
                        value={selectedPlan?.id ?? ""}
                        onChange={(event) => {
                          const plan = plans.find((p) => p.id === event.target.value);
                          setSelectedPlan(plan ?? null);
                        }}
                        className="h-12 w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 text-sm font-semibold text-[color:var(--ink)] outline-none transition-colors focus:border-[#0c4a27]"
                      >
                        <option value="" disabled>
                          Choose a plan...
                        </option>
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} — ${plan.usdAmount.toFixed(2)} /{" "}
                            {formatInterval(plan.billingIntervalDays)} ({plan.planCode})
                          </option>
                        ))}
                      </select>
                    </label>

                    {selectedPlan ? (
                      <div className="rounded-[1.75rem] border border-[color:var(--line)] bg-white px-5 py-5">
                        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-[color:var(--brand)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--brand)]">
                                {selectedPlan.planCode}
                              </span>
                              <span className="rounded-full border border-[color:var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
                                {selectedPlan.billingMode}
                              </span>
                            </div>
                            <div>
                              <h3 className="text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
                                {selectedPlan.name}
                              </h3>
                              <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                                ${selectedPlan.usdAmount.toFixed(2)} every{" "}
                                {formatInterval(selectedPlan.billingIntervalDays)}
                                {selectedPlan.trialDays > 0
                                  ? ` with ${selectedPlan.trialDays} trial days`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {selectedPlan.supportedMarkets.map((market: string) => (
                                <span
                                  key={market}
                                  className="rounded-full border border-[color:var(--line)] bg-[#f8fbf8] px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[color:var(--muted)]"
                                >
                                  {market}
                                </span>
                              ))}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void openCheckout(selectedPlan)}
                            disabled={isCreatingSession}
                            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-[#0c4a27] px-6 text-sm font-semibold tracking-[-0.02em] text-[#d9f6bc] transition-colors hover:bg-[#093a1e] disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {isCreatingSession ? "Opening..." : "Open checkout"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </Container>
      </section>

      {checkoutClient ? (
        <RenewCheckoutModal
          isOpen={isModalOpen}
          client={checkoutClient}
          session={session}
          clientSecret={clientSecret}
          onClose={closeCheckout}
          onSessionChange={handleSessionChange}
        />
      ) : null}
    </>
  );
}
