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
  Field,
  Input,
  MetricCard,
  Modal,
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

function createSubscriptionDraft(defaultCurrency = "") {
  return {
    planId: "",
    customerRef: "",
    customerName: "",
    billingCurrency: defaultCurrency,
    nextChargeAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    paymentAccountType: "bank" as SubscriptionRecord["paymentAccountType"],
  };
}

type SubscriptionDraft = ReturnType<typeof createSubscriptionDraft>;

type SubscriptionEditDraft = {
  localAmount: string;
  nextChargeAt: string;
  paymentAccountType: SubscriptionRecord["paymentAccountType"];
  status: SubscriptionRecord["status"];
};

function createEditDraft(subscription: SubscriptionRecord): SubscriptionEditDraft {
  return {
    localAmount: String(subscription.localAmount),
    nextChargeAt: subscription.nextChargeAt.slice(0, 16),
    paymentAccountType: subscription.paymentAccountType,
    status: subscription.status,
  };
}

export default function SubscriptionsPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [status, setStatus] = useState<SubscriptionStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [detailSubscription, setDetailSubscription] = useState<SubscriptionRecord | null>(null);
  const [editSubscription, setEditSubscription] = useState<SubscriptionRecord | null>(null);
  const [draft, setDraft] = useState<SubscriptionDraft>(createSubscriptionDraft());
  const [editDraft, setEditDraft] = useState<SubscriptionEditDraft | null>(null);

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
    [mode, page, search, status]
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
  const planNameById = useMemo(
    () => new Map(plans.map((plan) => [plan.id, plan.name])),
    [plans]
  );

  useEffect(() => {
    if (!message && !errorMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3200);

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
      if (
        current.billingCurrency &&
        (!selectedDraftPlan || selectedDraftPlan.supportedMarkets.includes(current.billingCurrency))
      ) {
        return current;
      }

      if (!nextCurrency) {
        return current;
      }

      return {
        ...current,
        billingCurrency: nextCurrency,
      };
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
        if (!cancelled) {
          setQuote(nextQuote);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(toErrorMessage(loadError));
        }
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
    const pastDue = subscriptions.filter(
      (subscription) => subscription.status === "past_due"
    ).length;
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
    } catch (actionError) {
      setErrorMessage(toErrorMessage(actionError));
    } finally {
      setIsBusy(null);
    }
  }

  function resetDraft() {
    setDraft(createSubscriptionDraft(marketCatalog?.defaultMarket ?? ""));
    setQuote(null);
    setQuoteError(null);
  }

  function openCreateModal() {
    resetDraft();
    setShowCreate(true);
  }

  function openEditModal(subscription: SubscriptionRecord) {
    setEditSubscription(subscription);
    setEditDraft(createEditDraft(subscription));
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
      resetDraft();
      setMessage("Subscription created.");
    });
  }

  async function handleEdit() {
    if (!token || !editSubscription || !editDraft) {
      return;
    }

    await runAction(`edit-subscription:${editSubscription.id}`, async () => {
      await updateSubscription({
        token,
        subscriptionId: editSubscription.id,
        environment: mode,
        payload: {
          localAmount: Number(editDraft.localAmount),
          nextChargeAt: new Date(editDraft.nextChargeAt).toISOString(),
          paymentAccountType: editDraft.paymentAccountType,
          status: editDraft.status,
        },
      });
      setEditSubscription(null);
      setEditDraft(null);
      setMessage("Subscription updated.");
    });
  }

  async function handleStatusChange(
    subscription: SubscriptionRecord,
    nextStatus: SubscriptionRecord["status"]
  ) {
    if (!token) {
      return;
    }

    await runAction(`update-subscription:${subscription.id}`, async () => {
      await updateSubscription({
        token,
        subscriptionId: subscription.id,
        environment: mode,
        payload: {
          status: nextStatus,
        },
      });
      setDetailSubscription(null);
      setMessage("Subscription updated.");
    });
  }

  async function handleQueueCharge(subscription: SubscriptionRecord) {
    if (!token) {
      return;
    }

    await runAction(`queue-charge:${subscription.id}`, async () => {
      await queueSubscriptionCharge({
        token,
        subscriptionId: subscription.id,
        environment: mode,
      });
      setDetailSubscription(null);
      setMessage("Charge queued.");
    });
  }

  if (isLoading && !data) {
    return (
      <PageState
        title="Loading subscriptions"
        message="Fetching recurring billing records for the selected environment."
      />
    );
  }

  if (error || !data) {
    return (
      <PageState
        title="Subscriptions unavailable"
        message={error ?? "Unable to load subscriptions."}
        tone="danger"
        action={
          <button className="text-sm font-semibold" onClick={() => void reload()}>
            Retry
          </button>
        }
      />
    );
  }

  const canCreate =
    !!draft.planId &&
    !!draft.billingCurrency &&
    !!draft.customerRef.trim() &&
    !!draft.customerName.trim() &&
    !!draft.nextChargeAt &&
    !!quote;

  const canEdit =
    !!editDraft &&
    Number(editDraft.localAmount) > 0 &&
    editDraft.nextChargeAt.trim().length > 0;

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard
          label="Subscriptions"
          value={String(metrics.total)}
          note="Tracked billing records"
        />
        <MetricCard label="Active" value={String(metrics.active)} note="Visible page" />
        <MetricCard label="Past due" value={String(metrics.pastDue)} note="Visible page" />
        <MetricCard label="Due soon" value={String(metrics.dueSoon)} note="Visible page" />
      </StatGrid>

      <Card
        title="Subscriptions"
        description="Recurring and usage-based subscriptions for the selected environment."
        action={<Button onClick={openCreateModal}>Create subscription</Button>}
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as SubscriptionStatusFilter);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="past_due">Past due</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Input
              placeholder="Search by customer name or ref"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-[#a8382b]">{errorMessage}</p> : null}

          <Table columns={["Customer", "Plan", "Amount", "Next charge", "Actions"]}>
            {subscriptions.map((subscription) => (
              <TableRow key={subscription.id} columns={5}>
                <button
                  type="button"
                  className="text-left outline-none"
                  onClick={() => setDetailSubscription(subscription)}
                >
                  <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                    {subscription.customerName}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    {subscription.customerRef}
                  </p>
                </button>
                <p className="self-center text-sm text-[color:var(--muted)]">
                  {planNameById.get(subscription.planId) ?? "Plan"}
                </p>
                <p className="self-center text-sm text-[color:var(--muted)]">
                  {formatCurrency(subscription.localAmount, subscription.billingCurrency)}
                </p>
                <p className="self-center text-sm text-[color:var(--muted)]">
                  {formatDateTime(subscription.nextChargeAt)}
                </p>
                <div className="flex flex-wrap items-center gap-2 self-center">
                  <StatusBadge value={subscription.status} />
                  <button
                    type="button"
                    onClick={() => setDetailSubscription(subscription)}
                    className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)] transition-colors hover:bg-[#f5f4ef]"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(subscription)}
                    className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)] transition-colors hover:bg-[#f5f4ef]"
                  >
                    Edit
                  </button>
                </div>
              </TableRow>
            ))}
          </Table>

          <PaginationControls
            page={pagination.page}
            total={pagination.total}
            totalPages={pagination.totalPages}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
          />
        </div>
      </Card>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create subscription"
        description="Attach a customer to an existing plan and schedule the first charge."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              tone="brand"
              disabled={isBusy === "create-subscription" || !canCreate}
              onClick={() => void handleCreate()}
            >
              {isBusy === "create-subscription" ? "Saving..." : "Create subscription"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Plan
            </label>
            <Select
              value={draft.planId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  planId: event.target.value,
                }))
              }
            >
              <option value="">Select plan</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Billing market
            </label>
            <Select
              value={draft.billingCurrency}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  billingCurrency: event.target.value,
                }))
              }
            >
              <option value="">Select currency</option>
              {supportedBillingCurrencies.map((market) => (
                <option key={market.currency} value={market.currency}>
                  {market.currency} · {market.currencyName}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Customer reference
            </label>
            <Input
              placeholder="cust_001"
              value={draft.customerRef}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  customerRef: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Customer name
            </label>
            <Input
              placeholder="Acme Ghana"
              value={draft.customerName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  customerName: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Collection method
            </label>
            <Select
              value={draft.paymentAccountType}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  paymentAccountType: event.target.value as SubscriptionRecord["paymentAccountType"],
                }))
              }
            >
              <option value="bank">Bank</option>
              <option value="momo">MoMo</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              First charge
            </label>
            <Input
              type="datetime-local"
              value={draft.nextChargeAt}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  nextChargeAt: event.target.value,
                }))
              }
            />
          </div>

          <div className="md:col-span-2">
            <Field
              label="Local quote"
              value={
                <div className="space-y-1">
                  <div>
                    {quote
                      ? formatCurrency(quote.localAmount, quote.currency)
                      : isQuoteLoading
                        ? "Loading quote..."
                        : "Select a plan and billing market"}
                  </div>
                  <p className="text-xs font-medium text-[color:var(--muted)]">
                    {quote
                      ? `${quote.fxRate.toFixed(2)} ${quote.currency} per USDC`
                      : quoteError ?? "The amount is derived from the selected plan."}
                  </p>
                </div>
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!detailSubscription}
        onClose={() => setDetailSubscription(null)}
        title={detailSubscription?.customerName ?? "Subscription details"}
        description={
          detailSubscription
            ? `${planNameById.get(detailSubscription.planId) ?? "Plan"} · ${
                detailSubscription.customerRef
              }`
            : undefined
        }
        size="lg"
        footer={
          detailSubscription ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {detailSubscription.onchain.txHash ? (
                  <a
                    href={getSolanaTxUrl(mode, detailSubscription.onchain.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)] transition-colors hover:bg-[#f5f4ef]"
                  >
                    View tx
                    <svg
                      className="h-3 w-3 opacity-60"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                      />
                    </svg>
                  </a>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => openEditModal(detailSubscription)}>Edit</Button>
                <Button
                  tone="brand"
                  disabled={isBusy === `queue-charge:${detailSubscription.id}`}
                  onClick={() => void handleQueueCharge(detailSubscription)}
                >
                  {isBusy === `queue-charge:${detailSubscription.id}`
                    ? "Queueing..."
                    : "Queue charge"}
                </Button>
                {detailSubscription.status === "active" ? (
                  <Button
                    disabled={isBusy === `update-subscription:${detailSubscription.id}`}
                    onClick={() => void handleStatusChange(detailSubscription, "paused")}
                  >
                    Pause
                  </Button>
                ) : detailSubscription.status === "paused" ? (
                  <Button
                    disabled={isBusy === `update-subscription:${detailSubscription.id}`}
                    onClick={() => void handleStatusChange(detailSubscription, "active")}
                  >
                    Resume
                  </Button>
                ) : null}
                {detailSubscription.status !== "cancelled" ? (
                  <Button
                    tone="danger"
                    disabled={isBusy === `update-subscription:${detailSubscription.id}`}
                    onClick={() => void handleStatusChange(detailSubscription, "cancelled")}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null
        }
      >
        {detailSubscription ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status" value={<StatusBadge value={detailSubscription.status} />} />
            <Field
              label="Plan"
              value={planNameById.get(detailSubscription.planId) ?? detailSubscription.planId}
            />
            <Field label="Billing market" value={detailSubscription.billingCurrency} />
            <Field
              label="Local amount"
              value={formatCurrency(
                detailSubscription.localAmount,
                detailSubscription.billingCurrency
              )}
            />
            <Field label="Next charge" value={formatDateTime(detailSubscription.nextChargeAt)} />
            <Field label="Last charge" value={formatDateTime(detailSubscription.lastChargeAt)} />
            <Field label="Collection method" value={detailSubscription.paymentAccountType} />
            <Field label="Retry opens" value={formatDateTime(detailSubscription.retryAvailableAt)} />
            <Field
              label="Onchain status"
              value={<StatusBadge value={detailSubscription.onchain.status} />}
            />
            <Field
              label="Protocol subscription"
              value={detailSubscription.onchain.id ?? "Pending"}
            />
            <Field
              label="Latest tx"
              value={
                detailSubscription.onchain.txHash ? (
                  <a
                    href={getSolanaTxUrl(mode, detailSubscription.onchain.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--ink)] underline decoration-[color:var(--line)] underline-offset-4 transition-colors hover:text-[color:var(--muted)]"
                  >
                    {formatTxHash(detailSubscription.onchain.txHash)}
                  </a>
                ) : (
                  "Waiting for execution"
                )
              }
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!editSubscription && !!editDraft}
        onClose={() => {
          setEditSubscription(null);
          setEditDraft(null);
        }}
        title="Edit subscription"
        description={
          editSubscription
            ? `${editSubscription.customerName} · ${
                planNameById.get(editSubscription.planId) ?? "Plan"
              }`
            : undefined
        }
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              onClick={() => {
                setEditSubscription(null);
                setEditDraft(null);
              }}
            >
              Cancel
            </Button>
            <Button
              tone="brand"
              disabled={
                !canEdit ||
                !editSubscription ||
                isBusy === `edit-subscription:${editSubscription.id}`
              }
              onClick={() => void handleEdit()}
            >
              {editSubscription && isBusy === `edit-subscription:${editSubscription.id}`
                ? "Saving..."
                : "Save changes"}
            </Button>
          </div>
        }
      >
        {editDraft ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">
                Local amount
              </label>
              <Input
                value={editDraft.localAmount}
                onChange={(event) =>
                  setEditDraft((current) =>
                    current
                      ? {
                          ...current,
                          localAmount: event.target.value,
                        }
                      : current
                  )
                }
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">
                Collection method
              </label>
              <Select
                value={editDraft.paymentAccountType}
                onChange={(event) =>
                  setEditDraft((current) =>
                    current
                      ? {
                          ...current,
                          paymentAccountType: event.target.value as SubscriptionRecord["paymentAccountType"],
                        }
                      : current
                  )
                }
              >
                <option value="bank">Bank</option>
                <option value="momo">MoMo</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">
                Next charge
              </label>
              <Input
                type="datetime-local"
                value={editDraft.nextChargeAt}
                onChange={(event) =>
                  setEditDraft((current) =>
                    current
                      ? {
                          ...current,
                          nextChargeAt: event.target.value,
                        }
                      : current
                  )
                }
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">
                Status
              </label>
              <Select
                value={editDraft.status}
                onChange={(event) =>
                  setEditDraft((current) =>
                    current
                      ? {
                          ...current,
                          status: event.target.value as SubscriptionRecord["status"],
                        }
                      : current
                  )
                }
              >
                <option value="pending_activation">Pending activation</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="past_due">Past due</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
