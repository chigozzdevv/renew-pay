"use client";

import { useEffect, useMemo, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import {
  StatusBadge,
  formatCurrency,
  formatDateTime,
  formatTxHash,
  getSolanaTxUrl,
  toErrorMessage,
} from "@/components/dashboard/dashboard-utils";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Button,
  Card,
  DarkCard,
  DarkField,
  Input,
  MetricCard,
  PaginationControls,
  PageState,
  Select,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import {
  loadBillingMarketCatalog,
  loadPlanMarketQuote,
  type BillingMarketQuote,
} from "@/lib/markets";
import {
  createSubscription,
  loadSubscriptionWorkspacePage,
  queueSubscriptionCharge,
  updateSubscription,
  type SubscriptionRecord,
} from "@/lib/subscriptions";

type SubscriptionStatusFilter = SubscriptionRecord["status"] | "all";

export default function SubscriptionsPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [status, setStatus] = useState<SubscriptionStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({
    planId: "",
    customerRef: "",
    customerName: "",
    billingCurrency: "",
    nextChargeAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    paymentAccountType: "bank" as SubscriptionRecord["paymentAccountType"],
  });
  const [quote, setQuote] = useState<BillingMarketQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);

  const pageSize = 20;

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadSubscriptionWorkspacePage({
        token,
        merchantId,
        environment: mode,
        status,
        search,
        page,
        limit: pageSize,
      }),
    [mode, page, status, search]
  );
  const { data: marketCatalog } = useResource(
    async ({ token, merchantId }) =>
      loadBillingMarketCatalog({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );

  const subscriptions = data?.subscriptions ?? [];
  const plans = data?.plans ?? [];
  const pagination = data?.pagination ?? {
    page,
    limit: pageSize,
    total: subscriptions.length,
    totalPages: 1,
  };
  const selectedDraftPlan = plans.find((plan) => plan.id === draft.planId) ?? null;
  const supportedBillingCurrencies = marketCatalog
    ? marketCatalog.markets.filter((market) =>
        (selectedDraftPlan?.supportedMarkets ?? marketCatalog.merchantSupportedMarkets).includes(
          market.currency
        )
      )
    : [];
  const selectedSubscription =
    subscriptions.find((subscription) => subscription.id === selectedId) ??
    subscriptions[0] ??
    null;
  const planNameById = useMemo(
    () => new Map(plans.map((plan) => [plan.id, plan.name])),
    [plans]
  );

  useEffect(() => {
    if (!selectedSubscription) {
      setSelectedId(null);
      return;
    }

    setSelectedId(selectedSubscription.id);
  }, [selectedSubscription?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!message && !errorMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  useEffect(() => {
    setPage(1);
  }, [mode, search, status]);

  useEffect(() => {
    const nextCurrency =
      selectedDraftPlan?.supportedMarkets[0] ??
      marketCatalog?.defaultMarket ??
      marketCatalog?.merchantSupportedMarkets[0] ??
      "";

    setDraft((current) => {
      if (current.billingCurrency && selectedDraftPlan?.supportedMarkets.includes(current.billingCurrency)) {
        return current;
      }

      if (
        !current.billingCurrency &&
        nextCurrency &&
        (!selectedDraftPlan || selectedDraftPlan.supportedMarkets.includes(nextCurrency))
      ) {
        return { ...current, billingCurrency: nextCurrency };
      }

      if (
        current.billingCurrency &&
        selectedDraftPlan &&
        !selectedDraftPlan.supportedMarkets.includes(current.billingCurrency)
      ) {
        return { ...current, billingCurrency: nextCurrency };
      }

      return current;
    });
  }, [marketCatalog?.defaultMarket, marketCatalog?.merchantSupportedMarkets, selectedDraftPlan]);

  useEffect(() => {
    if (!token || !user?.merchantId || !draft.planId || !draft.billingCurrency) {
      setQuote(null);
      setQuoteError(null);
      setIsQuoteLoading(false);
      return;
    }

    let cancelled = false;
    setIsQuoteLoading(true);
    setQuoteError(null);

    void loadPlanMarketQuote({
      token,
      merchantId: user.merchantId,
      environment: mode,
      planId: draft.planId,
      currency: draft.billingCurrency,
    })
      .then((nextQuote) => {
        if (cancelled) {
          return;
        }

        setQuote(nextQuote);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setQuote(null);
        setQuoteError(toErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setIsQuoteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draft.billingCurrency, draft.planId, mode, token, user?.merchantId]);

  const metrics = useMemo(() => {
    const active = subscriptions.filter((subscription) => subscription.status === "active").length;
    const pastDue = subscriptions.filter((subscription) => subscription.status === "past_due").length;
    const dueSoon = subscriptions.filter(
      (subscription) =>
        new Date(subscription.nextChargeAt).getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000
    ).length;

    return {
      total: pagination.total,
      active,
      pastDue,
      dueSoon,
    };
  }, [pagination.total, subscriptions]);

  async function runAction(key: string, runner: () => Promise<void>) {
    setIsBusy(key);
    setMessage(null);
    setErrorMessage(null);

    try {
      await runner();
      await reload();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(null);
    }
  }

  async function handleCreate() {
    if (!token || !user?.merchantId || !draft.planId) {
      return;
    }

    await runAction("create-subscription", async () => {
      await createSubscription({
        token,
        merchantId: user.merchantId,
        environment: mode,
        planId: draft.planId,
        customerRef: draft.customerRef.trim(),
        customerName: draft.customerName.trim(),
        billingCurrency: draft.billingCurrency,
        localAmount: quote?.localAmount,
        nextChargeAt: new Date(draft.nextChargeAt).toISOString(),
        paymentAccountType: draft.paymentAccountType,
      });
      setShowCreate(false);
      setDraft({
        planId: "",
        customerRef: "",
        customerName: "",
        billingCurrency: marketCatalog?.defaultMarket ?? "",
        nextChargeAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        paymentAccountType: "bank",
      });
      setQuote(null);
      setMessage("Subscription created.");
    });
  }

  async function handleStatusChange(nextStatus: SubscriptionRecord["status"]) {
    if (!token || !selectedSubscription) {
      return;
    }

    await runAction("update-subscription", async () => {
      await updateSubscription({
        token,
        subscriptionId: selectedSubscription.id,
        environment: mode,
        payload: {
          status: nextStatus,
        },
      });
      setMessage("Subscription updated.");
    });
  }

  async function handleQueueCharge() {
    if (!token || !selectedSubscription) {
      return;
    }

    await runAction("queue-charge", async () => {
      await queueSubscriptionCharge({
        token,
        subscriptionId: selectedSubscription.id,
        environment: mode,
      });
      setMessage("Charge queued.");
    });
  }

  if (isLoading && !data) {
    return (
      <PageState title="Loading subscriptions" message="Fetching recurring billing records for the selected environment." />
    );
  }

  if (error || !data) {
    return (
      <PageState
        title="Subscriptions unavailable"
        message={error ?? "Unable to load subscriptions."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard label="Subscriptions" value={String(metrics.total)} note="Tracked billing records" tone="brand" />
        <MetricCard label="Active" value={String(metrics.active)} note="Visible page" />
        <MetricCard label="Past due" value={String(metrics.pastDue)} note="Visible page" />
        <MetricCard label="Due soon" value={String(metrics.dueSoon)} note="Visible page" />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card
          title="Subscription list"
          description="Recurring and usage-based subscriptions for the selected environment."
          action={<Button onClick={() => setShowCreate((current) => !current)}>{showCreate ? "Close" : "Create subscription"}</Button>}
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <Select value={status} onChange={(event) => { setStatus(event.target.value as SubscriptionStatusFilter); setPage(1); }}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="past_due">Past due</option>
                <option value="cancelled">Cancelled</option>
              </Select>
              <Input
                placeholder="Search by customer name or ref"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              />
            </div>

            {showCreate ? (
              <div className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-[#f7faf6] p-4 md:grid-cols-2">
                <Select value={draft.planId} onChange={(event) => setDraft((current) => ({ ...current, planId: event.target.value }))}>
                  <option value="">Select plan</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </Select>
                <Select value={draft.billingCurrency} onChange={(event) => setDraft((current) => ({ ...current, billingCurrency: event.target.value }))}>
                  <option value="">Select currency</option>
                  {supportedBillingCurrencies.map((currency) => (
                    <option key={currency.currency} value={currency.currency}>
                      {currency.currency}
                    </option>
                  ))}
                </Select>
                <Input placeholder="Customer ref" value={draft.customerRef} onChange={(event) => setDraft((current) => ({ ...current, customerRef: event.target.value }))} />
                <Input placeholder="Customer name" value={draft.customerName} onChange={(event) => setDraft((current) => ({ ...current, customerName: event.target.value }))} />
                <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Local quote
                  </p>
                  <p className="mt-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                    {quote
                      ? formatCurrency(quote.localAmount, quote.currency)
                      : isQuoteLoading
                        ? "Loading quote..."
                        : "Select a plan and currency"}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">
                    {quote
                      ? `${quote.fxRate.toFixed(2)} ${quote.currency} per USDC`
                      : quoteError ?? "The amount is derived from the selected plan."}
                  </p>
                </div>
                <Select value={draft.paymentAccountType} onChange={(event) => setDraft((current) => ({ ...current, paymentAccountType: event.target.value as SubscriptionRecord["paymentAccountType"] }))}>
                  <option value="bank">Bank</option>
                  <option value="momo">MoMo</option>
                </Select>
                <Input className="md:col-span-2" type="datetime-local" value={draft.nextChargeAt} onChange={(event) => setDraft((current) => ({ ...current, nextChargeAt: event.target.value }))} />
                <div className="md:col-span-2">
                  <Button
                    tone="brand"
                    disabled={
                      isBusy === "create-subscription" ||
                      !draft.planId ||
                      !draft.billingCurrency ||
                      !draft.customerRef.trim() ||
                      !draft.customerName.trim() ||
                      !quote
                    }
                    onClick={() => void handleCreate()}
                  >
                    {isBusy === "create-subscription" ? "Saving..." : "Save subscription"}
                  </Button>
                </div>
              </div>
            ) : null}

            {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
            {errorMessage ? <p className="text-sm text-[#a8382b]">{errorMessage}</p> : null}

            <Table columns={["Customer", "Plan", "Amount", "Next charge", "Status"]}>
              {subscriptions.map((subscription) => (
                <button key={subscription.id} type="button" className="text-left" onClick={() => setSelectedId(subscription.id)}>
                  <TableRow columns={5}>
                    <div>
                      <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{subscription.customerName}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">{subscription.customerRef}</p>
                    </div>
                    <p className="text-sm text-[color:var(--muted)]">{planNameById.get(subscription.planId) ?? "Plan"}</p>
                    <p className="text-sm text-[color:var(--muted)]">{formatCurrency(subscription.localAmount, subscription.billingCurrency)}</p>
                    <p className="text-sm text-[color:var(--muted)]">{formatDateTime(subscription.nextChargeAt)}</p>
                    <div><StatusBadge value={subscription.status} /></div>
                  </TableRow>
                </button>
              ))}
            </Table>

            <PaginationControls
              page={pagination.page}
              total={pagination.total}
              totalPages={pagination.totalPages}
              onPrevious={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() =>
                setPage((current) => Math.min(pagination.totalPages, current + 1))
              }
            />
          </div>
        </Card>

        <DarkCard
          title={selectedSubscription?.customerName ?? "Subscription profile"}
          description={
            selectedSubscription
              ? planNameById.get(selectedSubscription.planId) ?? "Plan"
              : "Select a subscription to inspect its billing state."
          }
          action={
            selectedSubscription?.onchain.txHash ? (
              <a
                href={getSolanaTxUrl(mode, selectedSubscription.onchain.txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm font-semibold tracking-[-0.02em] text-white transition-colors hover:bg-white/10"
              >
                View tx ↗
              </a>
            ) : null
          }
        >
          {selectedSubscription ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DarkField label="Currency" value={selectedSubscription.billingCurrency} />
                <DarkField
                  label="Amount"
                  value={formatCurrency(
                    selectedSubscription.localAmount,
                    selectedSubscription.billingCurrency
                  )}
                />
                <DarkField
                  label="Next charge"
                  value={formatDateTime(selectedSubscription.nextChargeAt)}
                />
                <DarkField
                  label="Last charge"
                  value={formatDateTime(selectedSubscription.lastChargeAt)}
                />
                <DarkField
                  label="Account type"
                  value={selectedSubscription.paymentAccountType}
                />
                <DarkField
                  label="Retry opens"
                  value={formatDateTime(selectedSubscription.retryAvailableAt)}
                />
                <DarkField
                  label="Onchain status"
                  value={<StatusBadge value={selectedSubscription.onchain.status} />}
                />
                <DarkField
                  label="Protocol subscription"
                  value={selectedSubscription.onchain.id ?? "Pending"}
                />
                <DarkField
                  label="Latest tx"
                  value={
                    selectedSubscription.onchain.txHash ? (
                      <a
                        href={getSolanaTxUrl(mode, selectedSubscription.onchain.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-white underline decoration-white/35 underline-offset-4 transition-colors hover:text-[#d9f6bc]"
                      >
                        {formatTxHash(selectedSubscription.onchain.txHash)}
                      </a>
                    ) : (
                      "Waiting for execution"
                    )
                  }
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  tone="darkBrand"
                  disabled={isBusy === "queue-charge"}
                  onClick={() => void handleQueueCharge()}
                >
                  {isBusy === "queue-charge" ? "Queueing..." : "Queue charge"}
                </Button>
                {selectedSubscription.status === "active" ? (
                  <Button
                    tone="darkNeutral"
                    disabled={isBusy === "update-subscription"}
                    onClick={() => void handleStatusChange("paused")}
                  >
                    Pause
                  </Button>
                ) : selectedSubscription.status === "paused" ? (
                  <Button
                    tone="darkNeutral"
                    disabled={isBusy === "update-subscription"}
                    onClick={() => void handleStatusChange("active")}
                  >
                    Resume
                  </Button>
                ) : null}
                {selectedSubscription.status !== "cancelled" ? (
                  <Button
                    tone="darkDanger"
                    disabled={isBusy === "update-subscription"}
                    onClick={() => void handleStatusChange("cancelled")}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm leading-7 text-white/66">
              No subscription matches the current filter.
            </p>
          )}
        </DarkCard>
      </div>
    </div>
  );
}
