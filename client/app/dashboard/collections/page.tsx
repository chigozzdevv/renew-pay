"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Plus } from "lucide-react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import {
  StatusBadge,
  formatCurrency,
  formatDateTime,
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
  RowActionButton,
  Select,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import {
  createCollection,
  loadCollectionPage,
  type CollectionRecord,
} from "@/lib/collections";
import { loadSettlementAccounts } from "@/lib/settlement";

type CollectionStatusFilter = CollectionRecord["status"] | "all";
type RecurringFilter = "all" | "true" | "false";

const FALLBACK_CURRENCIES = ["NGN", "GHS", "KES"];

const EMPTY_DRAFT = {
  amount: "",
  currency: "NGN",
  reference: "",
  description: "",
  settlement: "",
  recurringEnabled: false,
  interval: "month" as const,
  intervalCount: "1",
};

export default function CollectionsPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [status, setStatus] = useState<CollectionStatusFilter>("all");
  const [recurring, setRecurring] = useState<RecurringFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [detailCollection, setDetailCollection] = useState<CollectionRecord | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pageSize = 20;

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadCollectionPage({
        token,
        merchantId,
        environment: mode,
        status,
        recurring:
          recurring === "all" ? "all" : recurring === "true",
        search,
        page,
        limit: pageSize,
      }),
    [mode, page, recurring, search, status]
  );
  const { data: settlementData, isLoading: isSettlementLoading } = useResource(
    async ({ token, merchantId }) =>
      loadSettlementAccounts({
        token,
        merchantId,
        environment: mode,
        status: "active",
        limit: 50,
      }),
    [mode]
  );

  const collections = data?.collections ?? [];
  const settlementAccounts = settlementData?.accounts ?? [];
  const defaultSettlementAccount =
    settlementAccounts.find((account) => account.isDefault) ?? null;
  const currencyOptions = useMemo(
    () =>
      user?.markets && user.markets.length > 0
        ? user.markets.map((market) => market.toUpperCase())
        : FALLBACK_CURRENCIES,
    [user?.markets]
  );
  const pagination = data?.pagination ?? {
    page,
    limit: pageSize,
    total: collections.length,
    totalPages: 1,
  };

  useEffect(() => {
    setPage(1);
  }, [mode, recurring, search, status]);

  useEffect(() => {
    if (currencyOptions.includes(draft.currency)) {
      return;
    }

    setDraft((current) => ({
      ...current,
      currency: currencyOptions[0] ?? "NGN",
    }));
  }, [currencyOptions, draft.currency]);

  useEffect(() => {
    if (!message && !errorMessage) return;
    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  useEffect(() => {
    if (settlementAccounts.length === 0) {
      if (draft.settlement) {
        setDraft((current) => ({ ...current, settlement: "" }));
      }
      return;
    }

    if (
      draft.settlement &&
      settlementAccounts.some((account) => account.id === draft.settlement)
    ) {
      return;
    }

    setDraft((current) => ({
      ...current,
      settlement: defaultSettlementAccount ? "" : settlementAccounts[0]?.id ?? "",
    }));
  }, [defaultSettlementAccount, draft.settlement, settlementAccounts]);

  const metrics = data?.summary ?? {
    total: pagination.total,
    created: 0,
    paid: 0,
    recurring: 0,
  };

  async function handleCreate() {
    if (!token || !user?.merchantId) return;

    setIsBusy(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      await createCollection({
        token,
        merchantId: user.merchantId,
        environment: mode,
        settlement: draft.settlement || null,
        amount: Number(draft.amount),
        currency: draft.currency.trim().toUpperCase(),
        reference: draft.reference.trim(),
        description: draft.description.trim(),
        recurring: {
          enabled: draft.recurringEnabled,
          interval: draft.recurringEnabled ? draft.interval : null,
          intervalCount: draft.recurringEnabled ? Number(draft.intervalCount) : null,
        },
      });
      setDraft({ ...EMPTY_DRAFT });
      setShowCreate(false);
      setMessage("Collection created.");
      await reload();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  const canCreate =
    Number(draft.amount) > 0 &&
    draft.currency.trim().length >= 2 &&
    draft.reference.trim().length >= 2 &&
    !isSettlementLoading &&
    (!draft.recurringEnabled || Number(draft.intervalCount) > 0);

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Collections unavailable"
        message={error ?? "Unable to load collections."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <StatGrid>
        <MetricCard label="Collections" value={String(metrics.total)} />
        <MetricCard label="Created" value={String(metrics.created)} />
        <MetricCard label="Paid" value={String(metrics.paid)} />
        <MetricCard label="Recurring" value={String(metrics.recurring)} />
      </StatGrid>

      <Card
        title="Collections"
        action={
          <Button tone="brand" className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            Create collection
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[160px_160px_minmax(0,1fr)]">
            <Select
              value={status}
              wrapperClassName="w-40 max-w-full"
              onChange={(event) => setStatus(event.target.value as CollectionStatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="created">Created</option>
              <option value="collecting">Collecting</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select
              value={recurring}
              wrapperClassName="w-44 max-w-full"
              onChange={(event) => setRecurring(event.target.value as RecurringFilter)}
            >
              <option value="all">All collections</option>
              <option value="false">One-time</option>
              <option value="true">Recurring</option>
            </Select>
            <Input
              placeholder="Search collection ID or description"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-[#9a3a31]">{errorMessage}</p> : null}

          <Table columns={["Collection", "Amount", "Settlement", "Status", "Actions"]}>
            {collections.map((collection) => (
              <TableRow key={collection.id} columns={5}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{collection.description}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{collection.id}</p>
                </div>
                <p className="self-center text-sm font-semibold text-[color:var(--ink)]">
                  {formatCurrency(collection.amount, collection.currency)}
                </p>
                <p className="self-center text-sm text-[color:var(--muted)]">
                  {collection.settlement ? collection.settlement.id.slice(-8) : "Default"}
                </p>
                <div className="self-center">
                  <StatusBadge value={collection.status} />
                </div>
                <div className="flex items-center gap-2 self-center">
                  <RowActionButton
                    label="View collection"
                    onClick={() => setDetailCollection(collection)}
                  >
                    <Eye className="h-4 w-4" strokeWidth={2.1} />
                  </RowActionButton>
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
        title="Create collection"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button tone="brand" disabled={isBusy || !canCreate} onClick={() => void handleCreate()}>
              {isBusy ? "Creating..." : "Create"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Amount</span>
            <Input value={draft.amount} inputMode="decimal" placeholder="25000" onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Currency</span>
            <Select
              value={draft.currency}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  currency: event.target.value,
                }))
              }
            >
              {currencyOptions.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-[color:var(--muted)]">Reference</span>
            <Input value={draft.reference} placeholder="order_1042" onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-[color:var(--muted)]">Description</span>
            <Input value={draft.description} placeholder="Website order" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-[color:var(--muted)]">Settlement</span>
            <Select
              value={draft.settlement}
              disabled={isSettlementLoading}
              onChange={(event) =>
                setDraft((current) => ({ ...current, settlement: event.target.value }))
              }
            >
              {defaultSettlementAccount ? (
                <option value="">Default · {defaultSettlementAccount.name}</option>
              ) : (
                <option value="">Default settlement</option>
              )}
              {settlementAccounts
                .filter((account) => !account.isDefault)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · Stellar USDC
                  </option>
                ))}
            </Select>
            {isSettlementLoading ? (
              <p className="text-xs font-medium text-[color:var(--muted)]">
                Loading settlement accounts.
              </p>
            ) : null}
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-[color:var(--line)] px-3 py-3 md:col-span-2">
            <input
              type="checkbox"
              checked={draft.recurringEnabled}
              onChange={(event) => setDraft((current) => ({ ...current, recurringEnabled: event.target.checked }))}
            />
            <span className="text-sm font-medium text-[color:var(--ink)]">Recurring</span>
          </label>
          {draft.recurringEnabled ? (
            <>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-[color:var(--muted)]">Interval</span>
                <Select value={draft.interval} onChange={(event) => setDraft((current) => ({ ...current, interval: event.target.value as typeof draft.interval }))}>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-[color:var(--muted)]">Every</span>
                <Input value={draft.intervalCount} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, intervalCount: event.target.value }))} />
              </label>
            </>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={!!detailCollection}
        onClose={() => setDetailCollection(null)}
        title={detailCollection?.id ?? "Collection"}
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setDetailCollection(null)}>Close</Button>
          </div>
        }
      >
        {detailCollection ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount" value={formatCurrency(detailCollection.amount, detailCollection.currency)} />
            <Field label="Status" value={detailCollection.status} />
            <Field
              label="Collection URL"
              value={
                <a
                  href={detailCollection.checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-black/20 underline-offset-4"
                >
                  {detailCollection.checkoutUrl}
                </a>
              }
            />
            <Field label="Created" value={formatDateTime(detailCollection.createdAt)} />
            <Field label="Recurring" value={detailCollection.recurring.enabled ? "Yes" : "No"} />
            <Field label="Reference" value={detailCollection.reference} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
