"use client";

import { useEffect, useMemo, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import {
  StatusBadge,
  formatCurrency,
  formatDate,
  toErrorMessage,
} from "@/components/dashboard/dashboard-utils";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Button,
  Card,
  Field,
  Input,
  LoadingState,
  MetricCard,
  Modal,
  PaginationControls,
  PageState,
  Select,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import { loadBillingMarketCatalog } from "@/lib/markets";
import {
  blacklistCustomer,
  createCustomer,
  loadCustomersPage,
  pauseCustomer,
  resumeCustomer,
  type CustomerRecord,
} from "@/lib/customers";

type CustomerStatusFilter = CustomerRecord["status"] | "all";

export default function CustomersPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [status, setStatus] = useState<CustomerStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<CustomerRecord | null>(null);
  const [blacklistTarget, setBlacklistTarget] = useState<CustomerRecord | null>(null);

  const [draft, setDraft] = useState({
    customerRef: "",
    name: "",
    email: "",
    market: "",
  });

  const pageSize = 20;

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadCustomersPage({
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

  const customers = data?.customers ?? [];
  const pagination = data?.pagination ?? {
    page,
    limit: pageSize,
    total: customers.length,
    totalPages: 1,
  };
  const supportedMarkets =
    marketCatalog?.markets.filter((market) =>
      marketCatalog.merchantSupportedMarkets.includes(market.currency)
    ) ?? [];

  useEffect(() => {
    if (!message && !errorMessage) return;
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
    if (!marketCatalog?.defaultMarket) return;
    setDraft((current) =>
      current.market ? current : { ...current, market: marketCatalog.defaultMarket ?? "" }
    );
  }, [marketCatalog?.defaultMarket]);

  const metrics = useMemo(() => {
    const atRisk = customers.filter(
      (c) =>
        c.status === "at_risk" ||
        c.billingState === "at_risk" ||
        c.paymentMethodState === "update_needed"
    ).length;
    const markets = new Set(customers.map((c) => c.market)).size;
    const active = customers.filter((c) => c.status === "active").length;
    return { total: pagination.total, active, atRisk, markets };
  }, [customers, pagination.total]);

  async function runAction(key: string, runner: () => Promise<void>) {
    setIsBusy(key);
    setMessage(null);
    setErrorMessage(null);
    try {
      await runner();
      await reload();
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsBusy(null);
    }
  }

  async function handleCreate() {
    if (!token || !user?.merchantId) return;
    await runAction("create-customer", async () => {
      await createCustomer({
        token,
        merchantId: user.merchantId,
        environment: mode,
        customerRef: draft.customerRef.trim(),
        name: draft.name.trim(),
        email: draft.email.trim(),
        market: draft.market.trim().toUpperCase(),
      });
      setDraft({
        customerRef: "",
        name: "",
        email: "",
        market: marketCatalog?.defaultMarket ?? draft.market,
      });
      setShowCreate(false);
      setMessage("Customer added.");
    });
  }

  async function handlePauseResume(customer: CustomerRecord, action: "pause" | "resume") {
    if (!token || !user?.merchantId) return;
    await runAction(action, async () => {
      if (action === "pause") {
        await pauseCustomer({ token, merchantId: user.merchantId, environment: mode, customerId: customer.id });
      } else {
        await resumeCustomer({ token, merchantId: user.merchantId, environment: mode, customerId: customer.id });
      }
      setDetailCustomer(null);
      setMessage(action === "pause" ? "Customer billing paused." : "Customer billing resumed.");
    });
  }

  async function handleBlacklist() {
    if (!token || !user?.merchantId || !blacklistTarget) return;
    await runAction("blacklist", async () => {
      await blacklistCustomer({
        token,
        merchantId: user.merchantId,
        environment: mode,
        customerId: blacklistTarget.id,
        reason: "Manual operator block.",
      });
      setBlacklistTarget(null);
      setDetailCustomer(null);
      setMessage("Customer blacklisted.");
    });
  }

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Customers unavailable"
        message={error ?? "Unable to load customers."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard label="Customers" value={String(metrics.total)} note="Directory records" />
        <MetricCard label="Active" value={String(metrics.active)} note="Visible page" />
        <MetricCard label="At risk" value={String(metrics.atRisk)} note="Visible page" />
        <MetricCard label="Markets" value={String(metrics.markets)} note="Visible page" />
      </StatGrid>

      <Card
        title="Customers"
        action={
          <Button tone="brand" onClick={() => {
            setDraft({ customerRef: "", name: "", email: "", market: marketCatalog?.defaultMarket ?? "" });
            setShowCreate(true);
          }}>
            Add customer
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <Select value={status} onChange={(e) => { setStatus(e.target.value as CustomerStatusFilter); setPage(1); }}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="at_risk">At risk</option>
              <option value="blacklisted">Blacklisted</option>
            </Select>
            <Input
              placeholder="Search by name, email, or ref"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-[#a8382b]">{errorMessage}</p> : null}

          <Table columns={["Customer", "Market", "Subscriptions", "Next renewal", "Actions"]}>
            {customers.map((customer) => (
              <TableRow key={customer.id} columns={5}>
                <button type="button" className="text-left outline-none" onClick={() => setDetailCustomer(customer)}>
                  <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{customer.name}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">{customer.email}</p>
                </button>
                <p className="self-center text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{customer.market}</p>
                <p className="self-center text-sm text-[color:var(--muted)]">{customer.subscriptionCount} active</p>
                <p className="self-center text-sm text-[color:var(--muted)]">{formatDate(customer.nextRenewalAt)}</p>
                <div className="flex items-center gap-2 self-center">
                  <StatusBadge value={customer.status}>
                    {customer.status === "at_risk" ? "At risk" : customer.status.replace(/_/g, " ")}
                  </StatusBadge>
                  {customer.status === "paused" ? (
                    <button
                      type="button"
                      onClick={() => void handlePauseResume(customer, "resume")}
                      className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)] transition-colors hover:bg-[#f5f4ef]"
                    >
                      Resume
                    </button>
                  ) : customer.status !== "blacklisted" ? (
                    <button
                      type="button"
                      onClick={() => void handlePauseResume(customer, "pause")}
                      className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)] transition-colors hover:bg-[#f5f4ef]"
                    >
                      Pause
                    </button>
                  ) : null}
                  {customer.status !== "blacklisted" ? (
                    <button
                      type="button"
                      onClick={() => setBlacklistTarget(customer)}
                      className="rounded-xl border border-[#dcb7b0] bg-[#fff7f6] px-3 py-1.5 text-xs font-semibold text-[#922f25] transition-colors hover:bg-[#ffefed]"
                    >
                      Block
                    </button>
                  ) : null}
                </div>
              </TableRow>
            ))}
          </Table>

          <PaginationControls
            page={pagination.page}
            total={pagination.total}
            totalPages={pagination.totalPages}
            onPrevious={() => setPage((c) => Math.max(1, c - 1))}
            onNext={() => setPage((c) => Math.min(pagination.totalPages, c + 1))}
          />
        </div>
      </Card>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add customer"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              tone="brand"
              disabled={isBusy === "create-customer" || !draft.customerRef.trim() || !draft.name.trim() || !draft.email.trim() || !draft.market}
              onClick={() => void handleCreate()}
            >
              {isBusy === "create-customer" ? "Saving..." : "Save customer"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">Customer ref</label>
            <Input placeholder="e.g. CUST-001" value={draft.customerRef} onChange={(e) => setDraft((c) => ({ ...c, customerRef: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">Market</label>
            <Select value={draft.market} onChange={(e) => setDraft((c) => ({ ...c, market: e.target.value }))}>
              <option value="">Select market</option>
              {supportedMarkets.map((market) => (
                <option key={market.currency} value={market.currency}>{market.currency}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">Name</label>
            <Input placeholder="Customer name" value={draft.name} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">Email</label>
            <Input placeholder="Customer email" value={draft.email} onChange={(e) => setDraft((c) => ({ ...c, email: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!detailCustomer}
        onClose={() => setDetailCustomer(null)}
        title={detailCustomer?.name ?? "Customer profile"}
        size="lg"
        footer={
          detailCustomer ? (
            <div className="flex items-center justify-end gap-3">
              {detailCustomer.status === "paused" ? (
                <Button
                  tone="brand"
                  disabled={isBusy === "resume"}
                  onClick={() => void handlePauseResume(detailCustomer, "resume")}
                >
                  {isBusy === "resume" ? "Resuming..." : "Resume billing"}
                </Button>
              ) : detailCustomer.status !== "blacklisted" ? (
                <Button
                  disabled={isBusy === "pause"}
                  onClick={() => void handlePauseResume(detailCustomer, "pause")}
                >
                  {isBusy === "pause" ? "Pausing..." : "Pause billing"}
                </Button>
              ) : null}
              {detailCustomer.status !== "blacklisted" ? (
                <Button
                  tone="danger"
                  disabled={isBusy === "blacklist"}
                  onClick={() => {
                    setDetailCustomer(null);
                    setBlacklistTarget(detailCustomer);
                  }}
                >
                  Blacklist
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {detailCustomer ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Market" value={detailCustomer.market} />
              <Field label="Monthly volume" value={formatCurrency(detailCustomer.monthlyVolumeUsdc)} />
              <Field label="Next renewal" value={formatDate(detailCustomer.nextRenewalAt)} />
              <Field label="Last charge" value={formatDate(detailCustomer.lastChargeAt)} />
              <Field label="Payment method" value={detailCustomer.paymentMethodState.replace(/_/g, " ")} />
              <Field label="Billing state" value={detailCustomer.billingState.replace(/_/g, " ")} />
            </div>
            {detailCustomer.blacklistReason ? (
              <div className="rounded-2xl border border-[#dcb7b0] bg-[#fff7f6] px-4 py-4 text-sm leading-7 text-[#922f25]">
                {detailCustomer.blacklistReason}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!blacklistTarget}
        onClose={() => setBlacklistTarget(null)}
        title="Blacklist customer"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setBlacklistTarget(null)}>Cancel</Button>
            <Button
              tone="danger"
              disabled={isBusy === "blacklist"}
              onClick={() => void handleBlacklist()}
            >
              {isBusy === "blacklist" ? "Blocking..." : "Blacklist"}
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-7 text-[color:var(--muted)]">
          Are you sure you want to blacklist <span className="font-semibold text-[color:var(--ink)]">{blacklistTarget?.name}</span>? This will stop all billing activity for this customer.
        </p>
      </Modal>
    </div>
  );
}
