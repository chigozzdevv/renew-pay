"use client";

import { useEffect, useMemo, useState } from "react";

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
  createInvoice,
  loadInvoicesPage,
  remindInvoice,
  sendInvoice,
  voidInvoice,
  type InvoiceRecord,
  type InvoiceStatus,
} from "@/lib/invoices";
import { loadBillingMarketCatalog } from "@/lib/markets";

type InvoiceStatusFilter = InvoiceStatus | "all";

type InvoiceDraftLineItem = {
  description: string;
  quantity: string;
  unitAmountUsd: string;
};

const defaultLineItem = (): InvoiceDraftLineItem => ({
  description: "",
  quantity: "1",
  unitAmountUsd: "",
});

export default function InvoicesPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [status, setStatus] = useState<InvoiceStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    customerName: "",
    customerEmail: "",
    billingCurrency: "",
    dueDate: "",
    note: "",
    status: "issued" as "draft" | "issued",
    lineItems: [defaultLineItem()],
  });

  const pageSize = 20;

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadInvoicesPage({
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

  const invoices = data?.invoices ?? [];
  const pagination = data?.pagination ?? {
    page,
    limit: pageSize,
    total: invoices.length,
    totalPages: 1,
  };
  const selectedInvoice =
    invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0] ?? null;
  const marketOptions =
    marketCatalog?.markets.filter((market) =>
      marketCatalog.merchantSupportedMarkets.includes(market.currency)
    ) ?? [];

  useEffect(() => {
    if (draft.billingCurrency || !marketCatalog?.defaultMarket) {
      return;
    }

    setDraft((current) => ({
      ...current,
      billingCurrency: marketCatalog.defaultMarket ?? "",
    }));
  }, [draft.billingCurrency, marketCatalog?.defaultMarket]);

  useEffect(() => {
    if (!selectedInvoice) {
      setSelectedId(null);
      return;
    }

    setSelectedId(selectedInvoice.id);
  }, [selectedInvoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const metrics = useMemo(() => {
    const issued = invoices.filter((invoice) => invoice.status === "issued").length;
    const pending = invoices.filter((invoice) =>
      ["pending_payment", "processing"].includes(invoice.status)
    ).length;
    const paid = invoices.filter((invoice) => invoice.status === "paid");

    return {
      total: pagination.total,
      issued,
      pending,
      paidValue: paid.reduce((sum, invoice) => sum + invoice.totals.usdcAmount, 0),
    };
  }, [invoices, pagination.total]);

  const draftTotalUsd = useMemo(
    () =>
      draft.lineItems.reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const unit = Number(item.unitAmountUsd) || 0;
        return sum + quantity * unit;
      }, 0),
    [draft.lineItems]
  );

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

  function resetDraft() {
    setDraft((current) => ({
      title: "",
      customerName: "",
      customerEmail: "",
      billingCurrency: marketCatalog?.defaultMarket ?? current.billingCurrency,
      dueDate: "",
      note: "",
      status: "issued",
      lineItems: [defaultLineItem()],
    }));
  }

  async function handleCreateInvoice() {
    if (!token || !user?.merchantId) {
      return;
    }

    await runAction("create-invoice", async () => {
      await createInvoice({
        token,
        merchantId: user.merchantId,
        environment: mode,
        title: draft.title.trim(),
        customerName: draft.customerName.trim(),
        customerEmail: draft.customerEmail.trim(),
        billingCurrency: draft.billingCurrency.trim().toUpperCase(),
        dueDate: new Date(draft.dueDate).toISOString(),
        note: draft.note.trim() || null,
        status: draft.status,
        lineItems: draft.lineItems.map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unitAmountUsd: Number(item.unitAmountUsd),
        })),
      });
      resetDraft();
      setMessage(draft.status === "draft" ? "Invoice drafted." : "Invoice created and sent.");
    });
  }

  async function handleSendInvoice() {
    if (!token || !selectedInvoice) {
      return;
    }

    await runAction("send-invoice", async () => {
      await sendInvoice({
        token,
        invoiceId: selectedInvoice.id,
        environment: mode,
      });
      setMessage("Invoice sent.");
    });
  }

  async function handleRemindInvoice() {
    if (!token || !selectedInvoice) {
      return;
    }

    await runAction("remind-invoice", async () => {
      await remindInvoice({
        token,
        invoiceId: selectedInvoice.id,
        environment: mode,
      });
      setMessage("Reminder sent.");
    });
  }

  async function handleVoidInvoice() {
    if (!token || !selectedInvoice) {
      return;
    }

    await runAction("void-invoice", async () => {
      await voidInvoice({
        token,
        invoiceId: selectedInvoice.id,
        environment: mode,
      });
      setMessage("Invoice voided.");
    });
  }

  async function handleCopyLink() {
    if (!selectedInvoice?.publicUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedInvoice.publicUrl);
      setMessage("Invoice link copied.");
    } catch {
      setErrorMessage("Could not copy the invoice link.");
    }
  }

  function updateDraftLineItem(
    index: number,
    field: keyof InvoiceDraftLineItem,
    value: string
  ) {
    setDraft((current) => ({
      ...current,
      lineItems: current.lineItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  }

  function addDraftLineItem() {
    setDraft((current) => ({
      ...current,
      lineItems: [...current.lineItems, defaultLineItem()],
    }));
  }

  function removeDraftLineItem(index: number) {
    setDraft((current) => ({
      ...current,
      lineItems:
        current.lineItems.length === 1
          ? current.lineItems
          : current.lineItems.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  if (isLoading && !data) {
    return (
      <PageState
        title="Loading invoices"
        message="Fetching one-time billing records for the selected environment."
      />
    );
  }

  if (error || !data) {
    return (
      <PageState
        title="Invoices unavailable"
        message={error ?? "Unable to load invoices."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  const canCreateInvoice =
    draft.title.trim().length > 1 &&
    draft.customerName.trim().length > 1 &&
    draft.customerEmail.trim().length > 3 &&
    draft.billingCurrency.trim().length > 1 &&
    draft.dueDate.trim().length > 0 &&
    draft.lineItems.every(
      (item) =>
        item.description.trim().length > 1 &&
        Number(item.quantity) > 0 &&
        Number(item.unitAmountUsd) > 0
    );

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard label="Invoices" value={String(metrics.total)} note="Visible page" tone="brand" />
        <MetricCard label="Issued" value={String(metrics.issued)} note="Awaiting payment or follow-up" />
        <MetricCard label="Pending" value={String(metrics.pending)} note="Payment or settlement in progress" />
        <MetricCard label="Paid" value={formatCurrency(metrics.paidValue)} note="Visible page in USDC" />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card title="Invoices" description="Create, send, and track one-time billing links.">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <Select value={status} onChange={(event) => { setStatus(event.target.value as InvoiceStatusFilter); setPage(1); }}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="issued">Issued</option>
                <option value="pending_payment">Pending payment</option>
                <option value="processing">Processing</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="void">Void</option>
              </Select>
              <Input
                placeholder="Search by invoice, customer, or title"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              />
            </div>

            <div className="rounded-2xl border border-[color:var(--line)] bg-[#f7faf6] p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Invoice title"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                />
                <Input
                  placeholder="Customer name"
                  value={draft.customerName}
                  onChange={(event) => setDraft((current) => ({ ...current, customerName: event.target.value }))}
                />
                <Input
                  placeholder="Customer email"
                  value={draft.customerEmail}
                  onChange={(event) => setDraft((current) => ({ ...current, customerEmail: event.target.value }))}
                />
                <Select
                  value={draft.billingCurrency}
                  onChange={(event) => setDraft((current) => ({ ...current, billingCurrency: event.target.value }))}
                >
                  <option value="">Billing market</option>
                  {marketOptions.map((market) => (
                    <option key={market.currency} value={market.currency}>
                      {market.currency} · {market.currencyName}
                    </option>
                  ))}
                </Select>
                <Input
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                />
                <Select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      status: event.target.value as "draft" | "issued",
                    }))
                  }
                >
                  <option value="issued">Create and send</option>
                  <option value="draft">Save draft</option>
                </Select>
              </div>

              <textarea
                className="mt-3 min-h-[88px] w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--ink)] outline-none transition focus:border-[#0c4a27]"
                placeholder="Optional note"
                value={draft.note}
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              />

              <div className="mt-4 space-y-3">
                {draft.lineItems.map((item, index) => (
                  <div key={`line-item-${index}`} className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-white p-3 md:grid-cols-[minmax(0,1.5fr)_110px_130px_auto]">
                    <Input
                      placeholder="Line item description"
                      value={item.description}
                      onChange={(event) =>
                        updateDraftLineItem(index, "description", event.target.value)
                      }
                    />
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(event) =>
                        updateDraftLineItem(index, "quantity", event.target.value)
                      }
                    />
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="USD"
                      value={item.unitAmountUsd}
                      onChange={(event) =>
                        updateDraftLineItem(index, "unitAmountUsd", event.target.value)
                      }
                    />
                    <Button
                      tone="neutral"
                      disabled={draft.lineItems.length === 1}
                      onClick={() => removeDraftLineItem(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Draft total
                  </p>
                  <p className="mt-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                    ${draftTotalUsd.toFixed(2)} USD
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button tone="neutral" onClick={addDraftLineItem}>
                    Add line item
                  </Button>
                  <Button
                    tone="brand"
                    disabled={isBusy === "create-invoice" || !canCreateInvoice}
                    onClick={() => void handleCreateInvoice()}
                  >
                    {isBusy === "create-invoice" ? "Saving..." : draft.status === "draft" ? "Save draft" : "Create invoice"}
                  </Button>
                </div>
              </div>
            </div>

            {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
            {errorMessage ? <p className="text-sm text-[#a8382b]">{errorMessage}</p> : null}

            <Table columns={["Invoice", "Customer", "Amount", "Due", "Status"]}>
              {invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  type="button"
                  className="block w-full text-left outline-none"
                  onClick={() => setSelectedId(invoice.id)}
                >
                  <TableRow columns={5} selected={selectedInvoice?.id === invoice.id}>
                    <div>
                      <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">{invoice.title}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[color:var(--muted)]">{invoice.customerName}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">{invoice.customerEmail}</p>
                    </div>
                    <p className="text-sm text-[color:var(--muted)]">
                      {invoice.billingCurrency} {invoice.totals.localAmount.toLocaleString()}
                    </p>
                    <p className="text-sm text-[color:var(--muted)]">{formatDateTime(invoice.dueDate)}</p>
                    <div><StatusBadge value={invoice.status} /></div>
                  </TableRow>
                </button>
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

        <DarkCard
          title={selectedInvoice?.invoiceNumber ?? "Invoice details"}
          description={
            selectedInvoice
              ? `${selectedInvoice.customerName} · ${selectedInvoice.customerEmail}`
              : "Select an invoice to inspect payment and settlement state."
          }
        >
          {selectedInvoice ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DarkField label="Title" value={selectedInvoice.title} />
                <DarkField label="Status" value={<StatusBadge value={selectedInvoice.status} />} />
                <DarkField
                  label="Local amount"
                  value={`${selectedInvoice.billingCurrency} ${selectedInvoice.totals.localAmount.toLocaleString()}`}
                />
                <DarkField
                  label="USDC amount"
                  value={formatCurrency(selectedInvoice.totals.usdcAmount)}
                />
                <DarkField label="Due" value={formatDateTime(selectedInvoice.dueDate)} />
                <DarkField label="Sent" value={formatDateTime(selectedInvoice.sentAt)} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/46">
                  Line items
                </p>
                <div className="mt-3 space-y-3">
                  {selectedInvoice.lineItems.map((item, index) => (
                    <div
                      key={`${selectedInvoice.id}-item-${index}`}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{item.description}</p>
                        <p className="mt-1 text-sm text-white/60">
                          {item.quantity} × ${item.unitAmountUsd.toFixed(2)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-white">
                        ${item.totalAmountUsd.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DarkField
                  label="Charge"
                  value={selectedInvoice.charge?.externalChargeId ?? "Not started"}
                />
                <DarkField
                  label="Settlement"
                  value={selectedInvoice.settlement?.status ?? "Not queued"}
                />
                <DarkField
                  label="Public link"
                  value={selectedInvoice.publicUrl}
                  href={selectedInvoice.publicUrl}
                />
                <DarkField
                  label="Reminder"
                  value={formatDateTime(selectedInvoice.lastRemindedAt)}
                />
              </div>

              {selectedInvoice.note ? (
                <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-sm leading-7 text-white/74">
                  {selectedInvoice.note}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button tone="darkBrand" onClick={() => void handleCopyLink()}>
                  Copy link
                </Button>
                <Button
                  tone="darkNeutral"
                  disabled={
                    isBusy === "send-invoice" ||
                    selectedInvoice.status === "paid" ||
                    selectedInvoice.status === "void"
                  }
                  onClick={() => void handleSendInvoice()}
                >
                  {isBusy === "send-invoice" ? "Sending..." : "Send invoice"}
                </Button>
                <Button
                  tone="darkNeutral"
                  disabled={
                    isBusy === "remind-invoice" ||
                    ["draft", "paid", "void"].includes(selectedInvoice.status)
                  }
                  onClick={() => void handleRemindInvoice()}
                >
                  {isBusy === "remind-invoice" ? "Sending..." : "Send reminder"}
                </Button>
                <Button
                  tone="darkDanger"
                  disabled={
                    isBusy === "void-invoice" ||
                    selectedInvoice.status === "paid" ||
                    selectedInvoice.status === "void"
                  }
                  onClick={() => void handleVoidInvoice()}
                >
                  {isBusy === "void-invoice" ? "Voiding..." : "Void invoice"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-7 text-white/66">
              No invoice matches the current filter.
            </p>
          )}
        </DarkCard>
      </div>
    </div>
  );
}
