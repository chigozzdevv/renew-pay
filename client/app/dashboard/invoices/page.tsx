"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

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
  createInvoice,
  loadInvoicesPage,
  remindInvoice,
  sendInvoice,
  updateInvoice,
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

type InvoiceDraft = {
  title: string;
  customerName: string;
  customerEmail: string;
  billingCurrency: string;
  dueDate: string;
  note: string;
  lineItems: InvoiceDraftLineItem[];
};

const defaultLineItem = (): InvoiceDraftLineItem => ({
  description: "",
  quantity: "1",
  unitAmountUsd: "",
});

function createInvoiceDraft(defaultCurrency = ""): InvoiceDraft {
  return {
    title: "",
    customerName: "",
    customerEmail: "",
    billingCurrency: defaultCurrency,
    dueDate: "",
    note: "",
    lineItems: [defaultLineItem()],
  };
}

function createEditDraft(invoice: InvoiceRecord): InvoiceDraft {
  return {
    title: invoice.title,
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    billingCurrency: invoice.billingCurrency,
    dueDate: invoice.dueDate.slice(0, 10),
    note: invoice.note ?? "",
    lineItems: invoice.lineItems.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitAmountUsd: String(item.unitAmountUsd),
    })),
  };
}

function canEditInvoice(invoice: InvoiceRecord) {
  return !invoice.charge && !invoice.settlement && !["paid", "void"].includes(invoice.status);
}

export default function InvoicesPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [status, setStatus] = useState<InvoiceStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<InvoiceRecord | null>(null);
  const [editInvoiceRecord, setEditInvoiceRecord] = useState<InvoiceRecord | null>(null);
  const [voidInvoiceRecord, setVoidInvoiceRecord] = useState<InvoiceRecord | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft>(createInvoiceDraft());
  const [editDraft, setEditDraft] = useState<InvoiceDraft | null>(null);

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
  const marketOptions =
    marketCatalog?.markets.filter((market) =>
      marketCatalog.merchantSupportedMarkets.includes(market.currency)
    ) ?? [];

  useEffect(() => {
    if (!draft.billingCurrency && marketCatalog?.defaultMarket) {
      setDraft((current) => ({
        ...current,
        billingCurrency: marketCatalog.defaultMarket ?? "",
      }));
    }
  }, [draft.billingCurrency, marketCatalog?.defaultMarket]);

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

  const editTotalUsd = useMemo(
    () =>
      (editDraft?.lineItems ?? []).reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const unit = Number(item.unitAmountUsd) || 0;
        return sum + quantity * unit;
      }, 0),
    [editDraft?.lineItems]
  );

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
    setDraft(createInvoiceDraft(marketCatalog?.defaultMarket ?? ""));
  }

  function openCreateModal() {
    resetDraft();
    setShowCreate(true);
  }

  function openEditModal(invoice: InvoiceRecord) {
    setEditInvoiceRecord(invoice);
    setEditDraft(createEditDraft(invoice));
  }

  function patchDraft<K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function patchEditDraft<K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current
    );
  }

  function updateLineItem(
    lineItems: InvoiceDraftLineItem[],
    index: number,
    field: keyof InvoiceDraftLineItem,
    value: string
  ) {
    return lineItems.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [field]: value } : item
    );
  }

  function removeLineItemFromDraft(lineItems: InvoiceDraftLineItem[], index: number) {
    if (lineItems.length === 1) {
      return lineItems;
    }

    return lineItems.filter((_, itemIndex) => itemIndex !== index);
  }

  function addDraftLineItem() {
    patchDraft("lineItems", [...draft.lineItems, defaultLineItem()]);
  }

  function addEditLineItem() {
    if (!editDraft) {
      return;
    }

    patchEditDraft("lineItems", [...editDraft.lineItems, defaultLineItem()]);
  }

  function updateCreateLineItem(
    index: number,
    field: keyof InvoiceDraftLineItem,
    value: string
  ) {
    patchDraft("lineItems", updateLineItem(draft.lineItems, index, field, value));
  }

  function updateEditLineItem(
    index: number,
    field: keyof InvoiceDraftLineItem,
    value: string
  ) {
    if (!editDraft) {
      return;
    }

    patchEditDraft("lineItems", updateLineItem(editDraft.lineItems, index, field, value));
  }

  function removeCreateLineItem(index: number) {
    patchDraft("lineItems", removeLineItemFromDraft(draft.lineItems, index));
  }

  function removeEditLineItem(index: number) {
    if (!editDraft) {
      return;
    }

    patchEditDraft("lineItems", removeLineItemFromDraft(editDraft.lineItems, index));
  }

  function buildLineItems(lineItems: InvoiceDraftLineItem[]) {
    return lineItems.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unitAmountUsd: Number(item.unitAmountUsd),
    }));
  }

  function isDraftValid(form: InvoiceDraft) {
    return (
      form.title.trim().length > 1 &&
      form.customerName.trim().length > 1 &&
      form.customerEmail.trim().length > 3 &&
      form.billingCurrency.trim().length > 1 &&
      form.dueDate.trim().length > 0 &&
      form.lineItems.every(
        (item) =>
          item.description.trim().length > 1 &&
          Number(item.quantity) > 0 &&
          Number(item.unitAmountUsd) > 0
      )
    );
  }

  async function handleCreateInvoice(nextStatus: "draft" | "issued") {
    if (!token || !user?.merchantId) {
      return;
    }

    await runAction(`create-invoice:${nextStatus}`, async () => {
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
        status: nextStatus,
        lineItems: buildLineItems(draft.lineItems),
      });
      setShowCreate(false);
      resetDraft();
      setMessage(nextStatus === "draft" ? "Invoice saved as draft." : "Invoice created.");
    });
  }

  async function handleUpdateInvoice(nextStatus?: "draft" | "issued") {
    if (!token || !editInvoiceRecord || !editDraft) {
      return;
    }

    await runAction(`update-invoice:${editInvoiceRecord.id}`, async () => {
      await updateInvoice({
        token,
        merchantId: editInvoiceRecord.merchantId,
        invoiceId: editInvoiceRecord.id,
        environment: mode,
        payload: {
          title: editDraft.title.trim(),
          customerName: editDraft.customerName.trim(),
          customerEmail: editDraft.customerEmail.trim(),
          billingCurrency: editDraft.billingCurrency.trim().toUpperCase(),
          dueDate: new Date(editDraft.dueDate).toISOString(),
          note: editDraft.note.trim() || null,
          lineItems: buildLineItems(editDraft.lineItems),
          status:
            nextStatus ??
            (editInvoiceRecord.status === "draft"
              ? "draft"
              : editInvoiceRecord.status === "issued" || editInvoiceRecord.status === "overdue"
                ? "issued"
                : undefined),
        },
      });
      setEditInvoiceRecord(null);
      setEditDraft(null);
      setMessage(nextStatus === "issued" ? "Invoice published." : "Invoice updated.");
    });
  }

  async function handleSendInvoice(invoice: InvoiceRecord) {
    if (!token) {
      return;
    }

    await runAction(`send-invoice:${invoice.id}`, async () => {
      await sendInvoice({
        token,
        invoiceId: invoice.id,
        environment: mode,
      });
      setMessage("Invoice sent.");
    });
  }

  async function handleRemindInvoice(invoice: InvoiceRecord) {
    if (!token) {
      return;
    }

    await runAction(`remind-invoice:${invoice.id}`, async () => {
      await remindInvoice({
        token,
        invoiceId: invoice.id,
        environment: mode,
      });
      setMessage("Reminder sent.");
    });
  }

  async function handleVoidInvoice(invoice: InvoiceRecord) {
    if (!token) {
      return;
    }

    await runAction(`void-invoice:${invoice.id}`, async () => {
      await voidInvoice({
        token,
        invoiceId: invoice.id,
        environment: mode,
      });
      setVoidInvoiceRecord(null);
      setDetailInvoice(null);
      setMessage("Invoice voided.");
    });
  }

  async function handleCopyLink(invoice: InvoiceRecord) {
    if (!invoice.publicUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(invoice.publicUrl);
      setMessage("Invoice link copied.");
    } catch {
      setErrorMessage("Could not copy the invoice link.");
    }
  }

  function renderInvoiceForm(
    form: InvoiceDraft,
    controls: {
      patch: <K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) => void;
      addLineItem: () => void;
      updateLineItem: (index: number, field: keyof InvoiceDraftLineItem, value: string) => void;
      removeLineItem: (index: number) => void;
    },
    totalUsd: number
  ) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Invoice title
            </label>
            <Input
              placeholder="March usage invoice"
              value={form.title}
              onChange={(event) => controls.patch("title", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Customer name
            </label>
            <Input
              placeholder="Acme Ghana"
              value={form.customerName}
              onChange={(event) => controls.patch("customerName", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Customer email
            </label>
            <Input
              placeholder="finance@acme.com"
              value={form.customerEmail}
              onChange={(event) => controls.patch("customerEmail", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Billing market
            </label>
            <Select
              value={form.billingCurrency}
              onChange={(event) => controls.patch("billingCurrency", event.target.value)}
            >
              <option value="">Select billing market</option>
              {marketOptions.map((market) => (
                <option key={market.currency} value={market.currency}>
                  {market.currency} · {market.currencyName}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Due date
            </label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(event) => controls.patch("dueDate", event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[color:var(--muted)]">
            Note
          </label>
          <textarea
            className="min-h-[96px] w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus:border-[#111111]"
            placeholder="Optional note for the customer"
            value={form.note}
            onChange={(event) => controls.patch("note", event.target.value)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Line items
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                Build the amount the customer sees in checkout.
              </p>
            </div>
            <Button onClick={controls.addLineItem}>Add line item</Button>
          </div>

          <div className="space-y-3">
            {form.lineItems.map((item, index) => (
              <div
                key={`line-item-${index}`}
                className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-[#faf9f5] p-3 md:grid-cols-[minmax(0,1.6fr)_110px_130px_auto]"
              >
                <Input
                  placeholder="Line item description"
                  value={item.description}
                  onChange={(event) =>
                    controls.updateLineItem(index, "description", event.target.value)
                  }
                />
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(event) =>
                    controls.updateLineItem(index, "quantity", event.target.value)
                  }
                />
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="USD"
                  value={item.unitAmountUsd}
                  onChange={(event) =>
                    controls.updateLineItem(index, "unitAmountUsd", event.target.value)
                  }
                />
                <Button
                  disabled={form.lineItems.length === 1}
                  onClick={() => controls.removeLineItem(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Field label="Draft total" value={`$${totalUsd.toFixed(2)} USD`} />
      </div>
    );
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
        action={
          <button className="text-sm font-semibold" onClick={() => void reload()}>
            Retry
          </button>
        }
      />
    );
  }

  const canCreate = isDraftValid(draft);
  const canEdit = editDraft ? isDraftValid(editDraft) : false;

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard label="Invoices" value={String(metrics.total)} note="Visible page" />
        <MetricCard
          label="Issued"
          value={String(metrics.issued)}
          note="Awaiting payment or follow-up"
        />
        <MetricCard
          label="Pending"
          value={String(metrics.pending)}
          note="Payment or settlement in progress"
        />
        <MetricCard
          label="Paid"
          value={formatCurrency(metrics.paidValue)}
          note="Visible page in USDC"
        />
      </StatGrid>

      <Card
        title="Invoices"
        description="Create, send, and track one-time billing links."
        action={<Button onClick={openCreateModal}>Create invoice</Button>}
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as InvoiceStatusFilter);
                setPage(1);
              }}
            >
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
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-[#a8382b]">{errorMessage}</p> : null}

          <Table columns={["Invoice", "Customer", "Amount", "Due", "Actions"]}>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id} columns={5}>
                <button
                  type="button"
                  className="text-left outline-none"
                  onClick={() => setDetailInvoice(invoice)}
                >
                  <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">{invoice.title}</p>
                </button>
                <div>
                  <p className="text-sm text-[color:var(--muted)]">{invoice.customerName}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">{invoice.customerEmail}</p>
                </div>
                <p className="self-center text-sm text-[color:var(--muted)]">
                  {invoice.billingCurrency} {invoice.totals.localAmount.toLocaleString()}
                </p>
                <p className="self-center text-sm text-[color:var(--muted)]">
                  {formatDateTime(invoice.dueDate)}
                </p>
                <div className="flex flex-wrap items-center gap-2 self-center">
                  <StatusBadge value={invoice.status} />
                  <button
                    type="button"
                    onClick={() => setDetailInvoice(invoice)}
                    className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)] transition-colors hover:bg-[#f5f4ef]"
                  >
                    View
                  </button>
                  {canEditInvoice(invoice) ? (
                    <button
                      type="button"
                      onClick={() => openEditModal(invoice)}
                      className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)] transition-colors hover:bg-[#f5f4ef]"
                    >
                      Edit
                    </button>
                  ) : null}
                  {!["paid", "void"].includes(invoice.status) ? (
                    <button
                      type="button"
                      onClick={() => setVoidInvoiceRecord(invoice)}
                      className="rounded-xl border border-[#dcb7b0] bg-[#fff7f6] px-3 py-1.5 text-xs font-semibold text-[#922f25] transition-colors hover:bg-[#ffefed]"
                    >
                      Void
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
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
          />
        </div>
      </Card>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create invoice"
        description="Build a hosted invoice and decide whether it should stay as a draft or go live now."
        size="xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={isBusy === "create-invoice:draft" || !canCreate}
              onClick={() => void handleCreateInvoice("draft")}
            >
              {isBusy === "create-invoice:draft" ? "Saving..." : "Save as draft"}
            </Button>
            <Button
              tone="brand"
              disabled={isBusy === "create-invoice:issued" || !canCreate}
              onClick={() => void handleCreateInvoice("issued")}
            >
              {isBusy === "create-invoice:issued" ? "Creating..." : "Publish"}
            </Button>
          </div>
        }
      >
        {renderInvoiceForm(
          draft,
          {
            patch: patchDraft,
            addLineItem: addDraftLineItem,
            updateLineItem: updateCreateLineItem,
            removeLineItem: removeCreateLineItem,
          },
          draftTotalUsd
        )}
      </Modal>

      <Modal
        open={!!detailInvoice}
        onClose={() => setDetailInvoice(null)}
        title={detailInvoice?.invoiceNumber ?? "Invoice details"}
        description={
          detailInvoice
            ? `${detailInvoice.customerName} · ${detailInvoice.customerEmail}`
            : undefined
        }
        size="lg"
        footer={
          detailInvoice ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button onClick={() => void handleCopyLink(detailInvoice)}>Copy link</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canEditInvoice(detailInvoice) ? (
                  <Button onClick={() => openEditModal(detailInvoice)}>Edit</Button>
                ) : null}
                <Button
                  disabled={
                    isBusy === `send-invoice:${detailInvoice.id}` ||
                    detailInvoice.status === "paid" ||
                    detailInvoice.status === "void"
                  }
                  onClick={() => void handleSendInvoice(detailInvoice)}
                >
                  {isBusy === `send-invoice:${detailInvoice.id}` ? "Sending..." : "Send"}
                </Button>
                <Button
                  disabled={
                    isBusy === `remind-invoice:${detailInvoice.id}` ||
                    ["draft", "paid", "void"].includes(detailInvoice.status)
                  }
                  onClick={() => void handleRemindInvoice(detailInvoice)}
                >
                  {isBusy === `remind-invoice:${detailInvoice.id}` ? "Sending..." : "Remind"}
                </Button>
                {!["paid", "void"].includes(detailInvoice.status) ? (
                  <Button
                    tone="danger"
                    disabled={isBusy === `void-invoice:${detailInvoice.id}`}
                    onClick={() => setVoidInvoiceRecord(detailInvoice)}
                  >
                    Void
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null
        }
      >
        {detailInvoice ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" value={detailInvoice.title} />
              <Field label="Status" value={<StatusBadge value={detailInvoice.status} />} />
              <Field
                label="Local amount"
                value={`${detailInvoice.billingCurrency} ${detailInvoice.totals.localAmount.toLocaleString()}`}
              />
              <Field
                label="USDC amount"
                value={formatCurrency(detailInvoice.totals.usdcAmount)}
              />
              <Field label="Due" value={formatDateTime(detailInvoice.dueDate)} />
              <Field label="Sent" value={formatDateTime(detailInvoice.sentAt)} />
              <Field
                label="Charge"
                value={detailInvoice.charge?.externalChargeId ?? "Not started"}
              />
              <Field
                label="Settlement"
                value={detailInvoice.settlement?.status ?? "Not queued"}
              />
              <Field
                label="Public link"
                value={
                  <a
                    href={detailInvoice.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--ink)] underline decoration-[color:var(--line)] underline-offset-4 transition-colors hover:text-[color:var(--muted)]"
                  >
                    Open invoice
                  </a>
                }
              />
              <Field label="Last reminder" value={formatDateTime(detailInvoice.lastRemindedAt)} />
            </div>

            <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-[#faf9f5] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Line items
              </p>
              <div className="mt-3 space-y-3">
                {detailInvoice.lineItems.map((item, index) => (
                  <div
                    key={`${detailInvoice.id}-item-${index}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--ink)]">
                        {item.description}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">
                        {item.quantity} × ${item.unitAmountUsd.toFixed(2)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[color:var(--ink)]">
                      ${item.totalAmountUsd.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {detailInvoice.note ? (
              <div className="rounded-2xl border border-[color:var(--line)] bg-[#faf9f5] px-4 py-4 text-sm leading-7 text-[color:var(--muted)]">
                {detailInvoice.note}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!editInvoiceRecord && !!editDraft}
        onClose={() => {
          setEditInvoiceRecord(null);
          setEditDraft(null);
        }}
        title="Edit invoice"
        description={
          editInvoiceRecord
            ? `${editInvoiceRecord.invoiceNumber} · ${editInvoiceRecord.customerName}`
            : undefined
        }
        size="xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              onClick={() => {
                setEditInvoiceRecord(null);
                setEditDraft(null);
              }}
            >
              Cancel
            </Button>
            {editInvoiceRecord?.status === "draft" ? (
              <Button
                disabled={
                  !canEdit ||
                  isBusy === `update-invoice:${editInvoiceRecord.id}`
                }
                onClick={() => void handleUpdateInvoice("draft")}
              >
                {isBusy === `update-invoice:${editInvoiceRecord.id}` ? "Saving..." : "Save draft"}
              </Button>
            ) : null}
            <Button
              tone="brand"
              disabled={
                !canEdit ||
                !editInvoiceRecord ||
                isBusy === `update-invoice:${editInvoiceRecord.id}`
              }
              onClick={() =>
                void handleUpdateInvoice(
                  editInvoiceRecord?.status === "draft" ? "issued" : undefined
                )
              }
            >
              {editInvoiceRecord?.status === "draft"
                ? isBusy === `update-invoice:${editInvoiceRecord.id}`
                  ? "Publishing..."
                  : "Publish"
                : isBusy === `update-invoice:${editInvoiceRecord?.id}`
                  ? "Saving..."
                  : "Save changes"}
            </Button>
          </div>
        }
      >
        {editDraft
          ? renderInvoiceForm(
              editDraft,
              {
                patch: patchEditDraft,
                addLineItem: addEditLineItem,
                updateLineItem: updateEditLineItem,
                removeLineItem: removeEditLineItem,
              },
              editTotalUsd
            )
          : null}
      </Modal>

      <Modal
        open={!!voidInvoiceRecord}
        onClose={() => setVoidInvoiceRecord(null)}
        title="Void invoice"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setVoidInvoiceRecord(null)}>Cancel</Button>
            <Button
              tone="danger"
              disabled={
                !voidInvoiceRecord || isBusy === `void-invoice:${voidInvoiceRecord.id}`
              }
              onClick={() => voidInvoiceRecord && void handleVoidInvoice(voidInvoiceRecord)}
            >
              {voidInvoiceRecord && isBusy === `void-invoice:${voidInvoiceRecord.id}`
                ? "Voiding..."
                : "Void invoice"}
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-7 text-[color:var(--muted)]">
          Void{" "}
          <span className="font-semibold text-[color:var(--ink)]">
            {voidInvoiceRecord?.invoiceNumber}
          </span>
          ? This keeps the record but removes it from collection.
        </p>
      </Modal>
    </div>
  );
}
