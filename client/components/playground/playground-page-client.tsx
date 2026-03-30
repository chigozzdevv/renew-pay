"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  type RenewCheckoutPlan,
  type RenewCheckoutSession,
} from "@renew.sh/sdk/core";
import { RenewCheckoutModal } from "@renew.sh/sdk/react";

import { PrivySessionCard } from "@/components/auth/privy-session-card";
import { Container } from "@/components/ui/container";
import {
  type PlaygroundCheckoutClient,
  createPlaygroundCheckoutClient,
  createPlaygroundSession,
  listPlaygroundInvoices,
  listPlaygroundPlans,
  loadPlaygroundWorkspaceUser,
  type PlaygroundInvoiceRecord,
  type PlaygroundSessionState,
} from "@/lib/playground";
import {
  ApiError,
  clearAccessToken,
  readAccessToken,
  readWorkspaceMode,
  type WorkspaceMode,
} from "@/lib/api";

const PLAYGROUND_STEPS = [
  "Sign in to your Renew workspace.",
  "Open Playground and choose an active plan or invoice.",
  "Start the checkout. If invoice, the payment page opens automatically.",
  "Complete the customer flow and payment steps in test mode.",
  "Watch the payment and settlement status update in Renew.",
] as const;

type PlaygroundSourceType = "plan" | "invoice";

function formatInterval(days: number) {
  if (days % 30 === 0) {
    return `${days / 30} month${days / 30 === 1 ? "" : "s"}`;
  }

  if (days % 7 === 0) {
    return `${days / 7} week${days / 7 === 1 ? "" : "s"}`;
  }

  return `${days} days`;
}

function formatCurrencyAmount(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString()}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString();
}

function humanizeValue(value: string) {
  return value.replace(/_/g, " ");
}

function toErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

export function PlaygroundPageClient() {
  const [plans, setPlans] = useState<readonly RenewCheckoutPlan[]>([]);
  const [invoices, setInvoices] = useState<readonly PlaygroundInvoiceRecord[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("test");
  const [hasWorkspaceSession, setHasWorkspaceSession] = useState(false);
  const [canAccessInvoices, setCanAccessInvoices] = useState(false);
  const [selectedSource, setSelectedSource] = useState<PlaygroundSourceType>("plan");
  const [selectedPlan, setSelectedPlan] = useState<RenewCheckoutPlan | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<PlaygroundInvoiceRecord | null>(null);
  const [checkoutClient, setCheckoutClient] = useState<PlaygroundCheckoutClient | null>(null);
  const [session, setSession] = useState<PlaygroundSessionState | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [planErrorMessage, setPlanErrorMessage] = useState<string | null>(null);
  const [invoiceErrorMessage, setInvoiceErrorMessage] = useState<string | null>(null);
  const [signInMessage, setSignInMessage] = useState<string | null>(null);

  const handlePlaygroundError = (error: unknown, fallbackMessage: string) => {
    if (
      error instanceof ApiError &&
      error.status === 401
    ) {
      clearAccessToken();
      setHasWorkspaceSession(false);
      setCanAccessInvoices(false);
      setPlans([]);
      setInvoices([]);
      setSelectedPlan(null);
      setSelectedInvoice(null);
      setSession(null);
      setClientSecret(null);
      setIsModalOpen(false);
      setPlanErrorMessage(null);
      setInvoiceErrorMessage(null);
      setSignInMessage(
        error.message === "Authentication token expired."
          ? "Your session expired. Sign in again to use Playground."
          : "Sign in to your workspace to use Playground."
      );
      return;
    }

    if (
      error instanceof Error &&
      error.message === "Sign in to your workspace to use Playground."
    ) {
      setHasWorkspaceSession(false);
      setCanAccessInvoices(false);
      setPlans([]);
      setInvoices([]);
      setSelectedPlan(null);
      setSelectedInvoice(null);
      setSession(null);
      setClientSecret(null);
      setIsModalOpen(false);
      setPlanErrorMessage(null);
      setInvoiceErrorMessage(null);
      setSignInMessage(error.message);
      return;
    }

    setSignInMessage(null);
    setPlanErrorMessage(error instanceof Error ? error.message : fallbackMessage);
  };

  useEffect(() => {
    try {
      setWorkspaceMode(readWorkspaceMode());
      setCheckoutClient(createPlaygroundCheckoutClient());
    } catch (error) {
      handlePlaygroundError(error, "Playground is not configured.");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadCatalog = async () => {
      const token = readAccessToken();

      if (!token) {
        setHasWorkspaceSession(false);
        setCanAccessInvoices(false);
        setPlans([]);
        setInvoices([]);
        setSelectedPlan(null);
        setSelectedInvoice(null);
        setSession(null);
        setClientSecret(null);
        setIsModalOpen(false);
        setPlanErrorMessage(null);
        setInvoiceErrorMessage(null);
        setSignInMessage("Sign in to your workspace to use Playground.");
        setIsLoadingCatalog(false);
        return;
      }

      setHasWorkspaceSession(true);
      setIsLoadingCatalog(true);
      setPlanErrorMessage(null);
      setInvoiceErrorMessage(null);
      setSignInMessage(null);

      try {
        const nextMode = readWorkspaceMode();
        setWorkspaceMode(nextMode);
        const workspaceUser = await loadPlaygroundWorkspaceUser();
        const nextCanAccessInvoices =
          workspaceUser.permissions.includes("invoices") ||
          workspaceUser.permissions.includes("team_admin");

        const [plansResult, invoicesResult] = await Promise.allSettled([
          listPlaygroundPlans(nextMode),
          nextCanAccessInvoices
            ? listPlaygroundInvoices({
                environment: nextMode,
                merchantId: workspaceUser.merchantId,
                permissions: workspaceUser.permissions,
              })
            : Promise.resolve([] as readonly PlaygroundInvoiceRecord[]),
        ]);

        if (!isMounted) {
          return;
        }

        setCanAccessInvoices(nextCanAccessInvoices);

        if (plansResult.status === "fulfilled") {
          setPlans(plansResult.value);
        } else {
          setPlans([]);
          setPlanErrorMessage(toErrorMessage(plansResult.reason, "Unable to load playground plans."));
        }

        if (invoicesResult.status === "fulfilled") {
          setInvoices(invoicesResult.value);
        } else {
          setInvoices([]);
          setInvoiceErrorMessage(
            toErrorMessage(invoicesResult.reason, "Unable to load playground invoices.")
          );
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        handlePlaygroundError(error, "Unable to load playground.");
      } finally {
        if (isMounted) {
          setIsLoadingCatalog(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  const hasPlans = useMemo(() => plans.length > 0, [plans]);
  const hasInvoices = useMemo(() => invoices.length > 0, [invoices]);

  useEffect(() => {
    if (selectedPlan && !plans.some((plan) => plan.id === selectedPlan.id)) {
      setSelectedPlan(null);
    }
  }, [plans, selectedPlan]);

  useEffect(() => {
    if (selectedInvoice && !invoices.some((invoice) => invoice.id === selectedInvoice.id)) {
      setSelectedInvoice(null);
    }
  }, [invoices, selectedInvoice]);

  useEffect(() => {
    if (selectedSource === "invoice" && !canAccessInvoices) {
      setSelectedSource("plan");
      return;
    }

    if (selectedSource === "plan" && !hasPlans && canAccessInvoices) {
      setSelectedSource("invoice");
    }
  }, [canAccessInvoices, hasPlans, selectedSource]);

  const openCheckout = async (plan: RenewCheckoutPlan) => {
    if (!checkoutClient) {
      setPlanErrorMessage("Playground checkout client is not configured.");
      return;
    }

    setSelectedPlan(plan);
    setIsCreatingSession(true);
    setPlanErrorMessage(null);
    setSignInMessage(null);

    try {
      const nextSession = await createPlaygroundSession(plan.id, workspaceMode);
      setSession(nextSession.session);
      setClientSecret(nextSession.clientSecret);
      setIsModalOpen(true);
    } catch (error) {
      handlePlaygroundError(error, "Unable to start playground checkout.");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const closeCheckout = () => {
    setIsModalOpen(false);
    setSession(null);
    setClientSecret(null);
  };

  const handleSessionChange = (nextSession: RenewCheckoutSession) => {
    setSession(nextSession);
  };

  const requiresSignIn = !hasWorkspaceSession || signInMessage !== null;

  return (
    <>
      <section className="relative overflow-hidden pb-24 pt-14 sm:pb-28 sm:pt-20">
        <Container className="space-y-6">
          <div className="grid gap-5 md:items-start md:grid-cols-2">
            <div className="flex min-w-0 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#111111] px-6 py-6 text-white shadow-[0_28px_100px_rgba(8,12,10,0.18)]">
              <div className="mb-5">
                <p className="text-sm leading-6 text-white/72">
                  Here's how to use the playground to test your invoice and plans:
                </p>
              </div>

              <div className="space-y-5">
                {PLAYGROUND_STEPS.map((step, index) => (
                  <div key={step} className="flex min-w-0 gap-4">
                    <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d9f6bc] text-sm font-semibold text-[#0c4a27]">
                      {index + 1}
                    </div>
                    <p className="min-w-0 text-sm leading-6 text-white/78">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-w-0 flex-col overflow-hidden rounded-[2rem] border border-white/80 bg-white/78 px-6 py-6 shadow-[0_20px_60px_rgba(10,20,12,0.06)] md:max-h-[31rem]">
              {requiresSignIn ? (
                <>
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
                      Workspace Session
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
                      Sign in to use Playground
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                      {signInMessage ?? "Open your workspace session first, then test checkout from an active plan."}
                    </p>
                  </div>
                  <div className="mt-auto min-w-0 overflow-y-auto pr-1">
                    <PrivySessionCard nextPath="/playground" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
                      {selectedSource === "invoice" ? "Choose an invoice" : "Choose a plan"}
                    </p>
                  </div>

                  {planErrorMessage && selectedSource === "plan" ? (
                    <div className="mt-5 rounded-[1.2rem] border border-[#e7c3bc] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b3b2d]">
                      {planErrorMessage}
                    </div>
                  ) : null}

                  {invoiceErrorMessage && selectedSource === "invoice" ? (
                    <div className="mt-5 rounded-[1.2rem] border border-[#e7c3bc] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b3b2d]">
                      {invoiceErrorMessage}
                    </div>
                  ) : null}

                  <div className="mt-5 flex min-h-0 flex-col gap-4 overflow-y-auto pr-1 md:flex-1">
                    {(hasPlans || canAccessInvoices) ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSource("plan")}
                          disabled={!hasPlans}
                          className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors ${
                            selectedSource === "plan"
                              ? "bg-[#111111] text-white"
                              : "border border-[color:var(--line)] bg-white text-[color:var(--ink)]"
                          } disabled:cursor-not-allowed disabled:opacity-45`}
                        >
                          Plans
                        </button>

                        {canAccessInvoices ? (
                          <button
                            type="button"
                            onClick={() => setSelectedSource("invoice")}
                            className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors ${
                              selectedSource === "invoice"
                                ? "bg-[#111111] text-white"
                                : "border border-[color:var(--line)] bg-white text-[color:var(--ink)]"
                            }`}
                          >
                            Invoices
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {isLoadingCatalog ? (
                      <div className="flex min-h-[14rem] items-center justify-center rounded-[1.4rem] border border-[color:var(--line)] bg-white px-5 py-10 text-center text-sm text-[color:var(--muted)]">
                        Loading playground catalog...
                      </div>
                    ) : null}

                    {!isLoadingCatalog && selectedSource === "plan" && hasPlans ? (
                      <>
                        <label className="flex flex-col gap-3 rounded-[1.4rem] border border-[color:var(--line)] bg-white px-4 py-4">
                          <span className="text-sm font-semibold text-[color:var(--ink)]">
                            Select a plan
                          </span>
                          <select
                            value={selectedPlan?.id ?? ""}
                            onChange={(event) => {
                              const plan = plans.find((p) => p.id === event.target.value);
                              setSelectedPlan(plan ?? null);
                            }}
                            className="h-11 w-full min-w-0 rounded-2xl border border-[color:var(--line)] bg-white px-4 text-sm font-semibold text-[color:var(--ink)] outline-none transition-colors focus:border-[#0c4a27]"
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
                          <div className="flex min-h-0 flex-col rounded-[1.75rem] border border-[color:var(--line)] bg-white px-5 py-5">
                            <div className="min-w-0 space-y-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-[color:var(--brand)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--brand)]">
                                  {selectedPlan.planCode}
                                </span>
                                <span className="rounded-full border border-[color:var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
                                  {selectedPlan.billingMode}
                                </span>
                              </div>

                              <div className="min-w-0">
                                <h3 className="break-words text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
                                  {selectedPlan.name}
                                </h3>
                                <p className="mt-2 break-words text-sm leading-6 text-[color:var(--muted)]">
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

                              <button
                                type="button"
                                onClick={() => void openCheckout(selectedPlan)}
                                disabled={isCreatingSession}
                                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#0c4a27] px-6 text-sm font-semibold tracking-[-0.02em] text-[#d9f6bc] transition-colors hover:bg-[#093a1e] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                              >
                                {isCreatingSession ? "Opening..." : "Open checkout"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex min-h-[14rem] items-center justify-center rounded-[1.75rem] border border-dashed border-[color:var(--line)] bg-white/70 px-5 py-6 text-center text-sm leading-6 text-[color:var(--muted)]">
                            Choose a plan above to show its details and open checkout from this panel.
                          </div>
                        )}
                      </>
                    ) : null}

                    {!isLoadingCatalog && selectedSource === "plan" && !hasPlans ? (
                      <div className="flex min-h-[14rem] items-center justify-center rounded-[1.75rem] border border-dashed border-[color:var(--line)] bg-white/70 px-5 py-6 text-center text-sm leading-6 text-[color:var(--muted)]">
                        No active playground plans are available in {workspaceMode} mode yet.
                      </div>
                    ) : null}

                    {!isLoadingCatalog && selectedSource === "invoice" && canAccessInvoices ? (
                      <>
                        <label className="flex flex-col gap-3 rounded-[1.4rem] border border-[color:var(--line)] bg-white px-4 py-4">
                          <span className="text-sm font-semibold text-[color:var(--ink)]">
                            Select an invoice
                          </span>
                          <select
                            disabled={!hasInvoices}
                            value={selectedInvoice?.id ?? ""}
                            onChange={(event) => {
                              const invoice = invoices.find((entry) => entry.id === event.target.value);
                              setSelectedInvoice(invoice ?? null);
                            }}
                            className="h-11 w-full min-w-0 rounded-2xl border border-[color:var(--line)] bg-white px-4 text-sm font-semibold text-[color:var(--ink)] outline-none transition-colors focus:border-[#0c4a27] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="" disabled>
                              Choose an invoice...
                            </option>
                            {invoices.map((invoice) => (
                              <option key={invoice.id} value={invoice.id}>
                                {invoice.invoiceNumber} — {invoice.title} (
                                {formatCurrencyAmount(
                                  invoice.billingCurrency,
                                  invoice.totals.localAmount
                                )}
                                )
                              </option>
                            ))}
                          </select>
                        </label>

                        {hasInvoices ? (
                          selectedInvoice ? (
                            <div className="flex min-h-0 flex-col rounded-[1.75rem] border border-[color:var(--line)] bg-white px-5 py-5">
                              <div className="min-w-0 space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-[color:var(--brand)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--brand)]">
                                    {selectedInvoice.invoiceNumber}
                                  </span>
                                  <span className="rounded-full border border-[color:var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
                                    {humanizeValue(selectedInvoice.status)}
                                  </span>
                                </div>

                                <div className="min-w-0">
                                  <h3 className="break-words text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
                                    {selectedInvoice.title}
                                  </h3>
                                  <p className="mt-2 break-words text-sm leading-6 text-[color:var(--muted)]">
                                    {selectedInvoice.customerName} · {selectedInvoice.customerEmail}
                                  </p>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-2xl border border-[color:var(--line)] bg-[#f8fbf8] px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                                      Amount
                                    </p>
                                    <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                                      {formatCurrencyAmount(
                                        selectedInvoice.billingCurrency,
                                        selectedInvoice.totals.localAmount
                                      )}
                                    </p>
                                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                                      {selectedInvoice.totals.usdcAmount.toFixed(2)} USDC settlement
                                    </p>
                                  </div>

                                  <div className="rounded-2xl border border-[color:var(--line)] bg-[#f8fbf8] px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                                      Due date
                                    </p>
                                    <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                                      {formatDate(selectedInvoice.dueDate)}
                                    </p>
                                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                                      {selectedInvoice.paymentInstructions?.status
                                        ? `Payment ${humanizeValue(selectedInvoice.paymentInstructions.status)}`
                                        : "Payment instructions pending"}
                                    </p>
                                  </div>
                                </div>

                                {selectedInvoice.paymentInstructions?.bankTransfer ? (
                                  <div className="rounded-2xl border border-[color:var(--line)] bg-[#f8fbf8] px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                                      Payment instructions
                                    </p>
                                    <div className="mt-3 space-y-2 text-sm text-[color:var(--muted)]">
                                      <p>
                                        Bank:{" "}
                                        <span className="font-semibold text-[color:var(--ink)]">
                                          {selectedInvoice.paymentInstructions.bankTransfer.bankName ?? "Pending"}
                                        </span>
                                      </p>
                                      <p>
                                        Account name:{" "}
                                        <span className="font-semibold text-[color:var(--ink)]">
                                          {selectedInvoice.paymentInstructions.bankTransfer.accountName ?? "Pending"}
                                        </span>
                                      </p>
                                      <p>
                                        Account number:{" "}
                                        <span className="font-semibold text-[color:var(--ink)]">
                                          {selectedInvoice.paymentInstructions.bankTransfer.accountNumber ?? "Pending"}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                ) : null}

                                {selectedInvoice.note ? (
                                  <div className="rounded-2xl border border-[color:var(--line)] bg-[#f8fbf8] px-4 py-4 text-sm leading-6 text-[color:var(--muted)]">
                                    {selectedInvoice.note}
                                  </div>
                                ) : null}

                                <Link
                                  href={`/invoices/${selectedInvoice.publicToken}`}
                                  className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#111111] px-6 text-sm font-semibold tracking-[-0.02em] text-white transition-colors hover:bg-[#222222] sm:w-auto"
                                >
                                  Open invoice page
                                </Link>
                              </div>
                            </div>
                          ) : (
                            <div className="flex min-h-[14rem] items-center justify-center rounded-[1.75rem] border border-dashed border-[color:var(--line)] bg-white/70 px-5 py-6 text-center text-sm leading-6 text-[color:var(--muted)]">
                              Choose an invoice above to show its details and open the payment page from this panel.
                            </div>
                          )
                        ) : (
                          <div className="flex min-h-[14rem] items-center justify-center rounded-[1.75rem] border border-dashed border-[color:var(--line)] bg-white/70 px-5 py-6 text-center text-sm leading-6 text-[color:var(--muted)]">
                            No issued playground invoices are available in {workspaceMode} mode yet.
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
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
