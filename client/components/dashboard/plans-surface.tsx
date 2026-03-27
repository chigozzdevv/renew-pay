"use client";

import { useEffect, useMemo, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { MarketMultiSelect } from "@/components/dashboard/market-controls";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import {
  StatusBadge,
  formatCurrency,
  formatTxHash,
  getSolanaTxUrl,
  toErrorMessage,
} from "@/components/dashboard/surface-utils";
import { useAuthedResource } from "@/components/dashboard/use-authed-resource";
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
import { loadBillingMarketCatalog } from "@/lib/markets";
import { createPlan, loadPlansPage, updatePlan, type PlanRecord } from "@/lib/plans";

type PlanStatusFilter = PlanRecord["status"] | "all";

export function PlansSurface() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [status, setStatus] = useState<PlanStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({
    planCode: "",
    name: "",
    usdAmount: "",
    usageRate: "",
    intervalPreset: "monthly" as string,
    billingIntervalDays: "",
    trialDays: "",
    retryPreset: "24" as string,
    retryWindowHours: "",
    billingMode: "fixed" as PlanRecord["billingMode"],
    supportedMarkets: [] as string[],
    status: "draft" as PlanRecord["status"],
  });

  const BILLING_INTERVALS: Record<string, { label: string; days: number }> = {
    weekly: { label: "Weekly", days: 7 },
    monthly: { label: "Monthly", days: 30 },
    quarterly: { label: "Quarterly", days: 90 },
    annually: { label: "Annually", days: 365 },
    custom: { label: "Custom", days: 0 },
  };

  const RETRY_WINDOWS: Record<string, { label: string; hours: number }> = {
    "12": { label: "12 hours", hours: 12 },
    "24": { label: "24 hours", hours: 24 },
    "48": { label: "48 hours", hours: 48 },
    "72": { label: "72 hours", hours: 72 },
    custom: { label: "Custom", hours: 0 },
  };

  function resolvedIntervalDays(): number {
    if (draft.intervalPreset === "custom") {
      return Number.parseInt(draft.billingIntervalDays, 10) || 0;
    }
    return BILLING_INTERVALS[draft.intervalPreset]?.days ?? 30;
  }

  function resolvedRetryHours(): number {
    if (draft.retryPreset === "custom") {
      return Number.parseInt(draft.retryWindowHours, 10) || 24;
    }
    return RETRY_WINDOWS[draft.retryPreset]?.hours ?? 24;
  }

  const pageSize = 20;

  const { data, isLoading, error, reload } = useAuthedResource(
    async ({ token, merchantId }) =>
      loadPlansPage({
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
  const { data: marketCatalog } = useAuthedResource(
    async ({ token, merchantId }) =>
      loadBillingMarketCatalog({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );

  const plans = data?.plans ?? [];
  const pagination = data?.pagination ?? {
    page,
    limit: pageSize,
    total: plans.length,
    totalPages: 1,
  };
  const merchantMarketOptions =
    marketCatalog?.markets.filter((market) =>
      marketCatalog.merchantSupportedMarkets.includes(market.currency)
    ) ?? [];
  const selectedPlan = plans.find((plan) => plan.id === selectedId) ?? plans[0] ?? null;

  useEffect(() => {
    if (!selectedPlan) {
      setSelectedId(null);
      return;
    }

    setSelectedId(selectedPlan.id);
  }, [selectedPlan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const metrics = useMemo(() => {
    const active = plans.filter((plan) => plan.status === "active").length;
    const metered = plans.filter((plan) => plan.billingMode === "metered").length;
    const markets = new Set(plans.flatMap((plan) => plan.supportedMarkets)).size;

    return {
      total: pagination.total,
      active,
      metered,
      markets,
    };
  }, [pagination.total, plans]);

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
    if (!token || !user?.merchantId) {
      return;
    }

    await runAction("create-plan", async () => {
      await createPlan({
        token,
        merchantId: user.merchantId,
        environment: mode,
        planCode: draft.planCode.trim().toUpperCase(),
        name: draft.name.trim(),
        usdAmount: Number(draft.usdAmount),
        usageRate: draft.usageRate.trim() ? Number(draft.usageRate) : null,
        billingIntervalDays: resolvedIntervalDays(),
        trialDays: draft.trialDays.trim() ? Number(draft.trialDays) : 0,
        retryWindowHours: resolvedRetryHours(),
        billingMode: draft.billingMode,
        supportedMarkets: draft.supportedMarkets,
        status: draft.status,
      });
      setShowCreate(false);
      setDraft({
        planCode: "",
        name: "",
        usdAmount: "",
        usageRate: "",
        intervalPreset: "monthly",
        billingIntervalDays: "",
        trialDays: "",
        retryPreset: "24",
        retryWindowHours: "",
        billingMode: "fixed",
        supportedMarkets: [],
        status: "draft",
      });
      setMessage("Plan created.");
    });
  }

  async function handleStatusChange(nextStatus: PlanRecord["status"]) {
    if (!token || !selectedPlan) {
      return;
    }

    await runAction("update-plan", async () => {
      await updatePlan({
        token,
        planId: selectedPlan.id,
        environment: mode,
        payload: {
          status: nextStatus,
        },
      });
      setMessage("Plan updated.");
    });
  }

  if (isLoading && !data) {
    return (
      <PageState
        title="Loading plans"
        message="Fetching plan configuration for the selected environment."
      />
    );
  }

  if (error || !data) {
    return (
      <PageState
        title="Plans unavailable"
        message={error ?? "Unable to load plans."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard label="Plans" value={String(metrics.total)} note="Configured billing plans" tone="brand" />
        <MetricCard label="Active" value={String(metrics.active)} note="Visible page" />
        <MetricCard label="Metered" value={String(metrics.metered)} note="Visible page" />
        <MetricCard label="Markets" value={String(metrics.markets)} note="Visible page" />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card
          title="Plan catalog"
          description="Plan records for the selected environment."
          action={<Button onClick={() => setShowCreate((current) => !current)}>{showCreate ? "Close" : "Create plan"}</Button>}
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <Select value={status} onChange={(event) => { setStatus(event.target.value as PlanStatusFilter); setPage(1); }}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </Select>
              <Input
                placeholder="Search by plan name or code"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              />
            </div>

            {showCreate ? (
              <div className="space-y-5 rounded-2xl border border-[color:var(--line)] bg-[#f7faf6] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  New plan
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[color:var(--muted)]">Plan name</label>
                    <Input placeholder="e.g. Pro Monthly" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[color:var(--muted)]">
                      Plan ID
                      <span className="ml-1.5 font-normal normal-case tracking-normal text-[color:var(--muted)]/70">
                        — short API reference code
                      </span>
                    </label>
                    <Input
                      placeholder="e.g. PRO_NGN_M"
                      value={draft.planCode}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, planCode: event.target.value.toUpperCase() }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[color:var(--muted)]">Price (USD)</label>
                    <Input placeholder="e.g. 9.99" value={draft.usdAmount} onChange={(event) => setDraft((current) => ({ ...current, usdAmount: event.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[color:var(--muted)]">Billing mode</label>
                    <Select value={draft.billingMode} onChange={(event) => setDraft((current) => ({ ...current, billingMode: event.target.value as PlanRecord["billingMode"] }))}>
                      <option value="fixed">Fixed — same charge every cycle</option>
                      <option value="metered">Metered — charges based on usage</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-xs font-semibold text-[color:var(--muted)]">
                      Billing interval
                      {draft.intervalPreset !== "custom" && (
                        <span className="ml-1.5 font-normal normal-case tracking-normal text-[color:var(--muted)]/70">
                          — {BILLING_INTERVALS[draft.intervalPreset]?.days ?? 0} days
                        </span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <Select
                        value={draft.intervalPreset}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            intervalPreset: event.target.value,
                            billingIntervalDays: "",
                          }))
                        }
                      >
                        {Object.entries(BILLING_INTERVALS).map(([key, { label }]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </Select>
                      {draft.intervalPreset === "custom" ? (
                        <Input
                          placeholder="Days"
                          value={draft.billingIntervalDays}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, billingIntervalDays: event.target.value }))
                          }
                        />
                      ) : null}
                    </div>
                  </div>

                  {draft.billingMode === "metered" ? (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-[color:var(--muted)]">Usage rate (per unit)</label>
                      <Input placeholder="e.g. 0.05" value={draft.usageRate} onChange={(event) => setDraft((current) => ({ ...current, usageRate: event.target.value }))} />
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[color:var(--muted)]">Trial period</label>
                    <Input placeholder="Days (0 = no trial)" value={draft.trialDays} onChange={(event) => setDraft((current) => ({ ...current, trialDays: event.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[color:var(--muted)]">Retry window</label>
                    <div className="flex gap-2">
                      <Select
                        value={draft.retryPreset}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            retryPreset: event.target.value,
                            retryWindowHours: "",
                          }))
                        }
                      >
                        {Object.entries(RETRY_WINDOWS).map(([key, { label }]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </Select>
                      {draft.retryPreset === "custom" ? (
                        <Input
                          placeholder="Hours"
                          value={draft.retryWindowHours}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, retryWindowHours: event.target.value }))
                          }
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-xs font-semibold text-[color:var(--muted)]">Billing markets</label>
                    <MarketMultiSelect
                      options={merchantMarketOptions}
                      value={draft.supportedMarkets}
                      onChange={(supportedMarkets) =>
                        setDraft((current) => ({ ...current, supportedMarkets }))
                      }
                      allLabel="All merchant markets"
                      placeholder="Select billing markets"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[color:var(--muted)]">Initial status</label>
                    <Select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as PlanRecord["status"] }))}>
                      <option value="draft">Draft — not yet live</option>
                      <option value="active">Active — open for checkout</option>
                    </Select>
                  </div>

                  <div className="flex items-end md:col-span-2">
                    <Button
                      tone="brand"
                      disabled={
                        isBusy === "create-plan" ||
                        !draft.planCode.trim() ||
                        !draft.name.trim() ||
                        !draft.usdAmount.trim() ||
                        (draft.intervalPreset === "custom" && !draft.billingIntervalDays.trim()) ||
                        draft.supportedMarkets.length === 0
                      }
                      onClick={() => void handleCreate()}
                    >
                      {isBusy === "create-plan" ? "Saving..." : "Save plan"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
            {errorMessage ? <p className="text-sm text-[#a8382b]">{errorMessage}</p> : null}

            <Table columns={["Plan", "Mode", "Price", "Markets", "Status"]}>
              {plans.map((plan) => (
                <button key={plan.id} type="button" className="text-left outline-none" onClick={() => setSelectedId(plan.id)}>
                  <TableRow columns={5} selected={selectedPlan?.id === plan.id}>
                    <div>
                      <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{plan.name}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">{plan.planCode}</p>
                    </div>
                    <p className="text-sm text-[color:var(--muted)]">{plan.billingMode}</p>
                    <p className="text-sm text-[color:var(--muted)]">{formatCurrency(plan.usdAmount, "USD")}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-[color:var(--muted)]">
                        {plan.supportedMarkets.slice(0, 2).join(", ")}
                      </span>
                      {plan.supportedMarkets.length > 2 ? (
                        <span className="inline-flex items-center rounded-full bg-[#e8f0e4] px-1.5 py-0.5 text-[11px] font-semibold text-[color:var(--brand)]">
                          +{plan.supportedMarkets.length - 2}
                        </span>
                      ) : null}
                    </div>
                    <div><StatusBadge value={plan.status} /></div>
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
          title={selectedPlan?.name ?? "Plan details"}
          description={
            selectedPlan?.planCode ?? "Select a plan to inspect current billing rules."
          }
          action={
            selectedPlan?.onchain.txHash ? (
              <a
                href={getSolanaTxUrl(mode, selectedPlan.onchain.txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm font-semibold tracking-[-0.02em] text-white transition-colors hover:bg-white/10"
              >
                View tx ↗
              </a>
            ) : null
          }
        >
          {selectedPlan ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DarkField
                  label="USD price"
                  value={formatCurrency(selectedPlan.usdAmount, "USD")}
                />
                <DarkField
                  label="Status"
                  value={<StatusBadge value={selectedPlan.status} />}
                />
                <DarkField label="Mode" value={selectedPlan.billingMode} />
                <DarkField
                  label="Interval"
                  value={`${selectedPlan.billingIntervalDays} days`}
                />
                <DarkField label="Trial" value={`${selectedPlan.trialDays} days`} />
                <DarkField
                  label="Retry window"
                  value={`${selectedPlan.retryWindowHours} hours`}
                />
                <DarkField
                  label="Onchain status"
                  value={<StatusBadge value={selectedPlan.onchain.status} />}
                />
                <DarkField
                  label="Protocol plan"
                  value={selectedPlan.onchain.id ?? "Pending"}
                />
                <DarkField
                  label="Markets"
                  value={
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {selectedPlan.supportedMarkets.map((m) => (
                        <span
                          key={m}
                          className="inline-flex items-center rounded-lg border border-white/12 bg-white/8 px-2 py-0.5 text-xs font-semibold text-white/80"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  }
                />
                <DarkField
                  label="Latest tx"
                  value={
                    selectedPlan.onchain.txHash ? (
                      <a
                        href={getSolanaTxUrl(mode, selectedPlan.onchain.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-white underline decoration-white/35 underline-offset-4 transition-colors hover:text-[#d9f6bc]"
                      >
                        {formatTxHash(selectedPlan.onchain.txHash)}
                      </a>
                    ) : (
                      "Waiting for execution"
                    )
                  }
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  value={selectedPlan.status}
                  disabled={isBusy === "update-plan"}
                  className="border-white/12 bg-white/6 text-white focus:border-[#d9f6bc]"
                  onChange={(event) =>
                    void handleStatusChange(
                      event.target.value as PlanRecord["status"]
                    )
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-7 text-white/66">
              No plan matches the current filter.
            </p>
          )}
        </DarkCard>
      </div>
    </div>
  );
}
