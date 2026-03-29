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
  LoadingState,
  MetricCard,
  PaginationControls,
  PageState,
  Select,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import { loadPaymentPage, retryCharge, type PaymentRecord } from "@/lib/payments";

type PaymentStatusFilter = PaymentRecord["status"] | "all";
type PaymentSourceFilter = PaymentRecord["sourceKind"] | "all";

export default function PaymentsPage() {
  const { token } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [status, setStatus] = useState<PaymentStatusFilter>("all");
  const [sourceKind, setSourceKind] = useState<PaymentSourceFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pageSize = 20;

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadPaymentPage({
        token,
        merchantId,
        environment: mode,
        status,
        sourceKind,
        search,
        page,
        limit: pageSize,
      }),
    [mode, page, search, sourceKind, status]
  );

  const payments = data?.payments ?? [];
  const pagination = data?.pagination ?? {
    page,
    limit: pageSize,
    total: payments.length,
    totalPages: 1,
  };
  const selectedPayment = payments.find((payment) => payment.id === selectedId) ?? payments[0] ?? null;

  useEffect(() => {
    if (!selectedPayment) {
      setSelectedId(null);
      return;
    }

    setSelectedId(selectedPayment.id);
  }, [selectedPayment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [mode, search, sourceKind, status]);

  const metrics = useMemo(() => {
    const settled = payments.filter((payment) => payment.status === "settled");
    const failed = payments.filter((payment) => payment.status === "failed");
    const pending = payments.filter((payment) =>
      ["pending", "awaiting_settlement", "confirming"].includes(payment.status)
    );

    return {
      total: pagination.total,
      settled: settled.reduce((sum, payment) => sum + payment.usdcAmount, 0),
      failed: failed.length,
      pending: pending.length,
    };
  }, [pagination.total, payments]);

  async function handleRetry() {
    if (!token || !selectedPayment) {
      return;
    }

    setIsBusy(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      await retryCharge({
        token,
        chargeId: selectedPayment.id,
        environment: mode,
      });
      setMessage("Retry queued.");
      await reload();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Payments unavailable"
        message={error ?? "Unable to load payments."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard label="Charges" value={String(metrics.total)} note="Recorded payment attempts" />
        <MetricCard label="Settled" value={formatCurrency(metrics.settled)} note="Visible page" />
        <MetricCard label="Pending" value={String(metrics.pending)} note="Visible page" />
        <MetricCard label="Failed" value={String(metrics.failed)} note="Visible page" />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card title="Payments">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <div className="grid gap-3 md:grid-cols-[180px_180px_minmax(0,1fr)] md:col-span-2">
                <Select value={sourceKind} onChange={(event) => { setSourceKind(event.target.value as PaymentSourceFilter); setPage(1); }}>
                  <option value="all">All sources</option>
                  <option value="subscription">Subscriptions</option>
                  <option value="invoice">Invoices</option>
                </Select>
                <Select value={status} onChange={(event) => { setStatus(event.target.value as PaymentStatusFilter); setPage(1); }}>
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="awaiting_settlement">Awaiting settlement</option>
                  <option value="confirming">Confirming</option>
                  <option value="settled">Settled</option>
                  <option value="failed">Failed</option>
                  <option value="reversed">Reversed</option>
                </Select>
                <Input
                  placeholder="Search by charge, invoice, or customer"
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                />
              </div>
            </div>

            {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
            {errorMessage ? <p className="text-sm text-[#a8382b]">{errorMessage}</p> : null}

            <Table columns={["Charge", "Source", "USDC", "Processed", "Status"]}>
              {payments.map((payment) => (
                <button key={payment.id} type="button" className="text-left" onClick={() => setSelectedId(payment.id)}>
                  <TableRow columns={5}>
                    <div>
                      <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{payment.externalChargeId}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">{payment.id.slice(-8)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[color:var(--muted)]">
                        {payment.sourceKind === "invoice"
                          ? payment.invoiceNumber ?? "Invoice"
                          : payment.customerName ?? payment.subscriptionId?.slice(-8) ?? "Subscription"}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]/80 capitalize">
                        {payment.sourceKind}
                      </p>
                    </div>
                    <p className="text-sm text-[color:var(--muted)]">{formatCurrency(payment.usdcAmount)}</p>
                    <p className="text-sm text-[color:var(--muted)]">{formatDateTime(payment.processedAt)}</p>
                    <div><StatusBadge value={payment.status} /></div>
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
          title={selectedPayment?.externalChargeId ?? "Charge details"}
          description={
            selectedPayment
              ? selectedPayment.sourceKind === "invoice"
                ? selectedPayment.invoiceNumber ?? selectedPayment.customerName ?? "Invoice payment"
                : selectedPayment.customerName ?? selectedPayment.subscriptionId ?? "Subscription payment"
              : "Select a charge to inspect it."
          }
        >
          {selectedPayment ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DarkField label="Local amount" value={String(selectedPayment.localAmount)} />
                <DarkField
                  label="USDC amount"
                  value={formatCurrency(selectedPayment.usdcAmount)}
                />
                <DarkField label="FX rate" value={String(selectedPayment.fxRate)} />
                <DarkField
                  label="Fee"
                  value={formatCurrency(selectedPayment.feeAmount)}
                />
                <DarkField
                  label="Source"
                  value={
                    selectedPayment.sourceKind === "invoice"
                      ? selectedPayment.invoiceNumber ?? "Invoice"
                      : selectedPayment.subscriptionId ?? "Subscription"
                  }
                />
                <DarkField
                  label="Settlement source"
                  value={selectedPayment.settlementSource ?? "Not set"}
                />
                <DarkField
                  label="Processed"
                  value={formatDateTime(selectedPayment.processedAt)}
                />
              </div>

              {selectedPayment.failureCode ? (
                <div className="rounded-2xl border border-[#603029] bg-[#2d1613] px-4 py-4 text-sm leading-7 text-[#ffb6aa]">
                  {selectedPayment.failureCode}
                </div>
              ) : null}

              {selectedPayment.sourceKind !== "invoice" &&
              selectedPayment.status !== "settled" &&
              selectedPayment.status !== "reversed" ? (
                <Button tone="darkBrand" disabled={isBusy} onClick={() => void handleRetry()}>
                  {isBusy ? "Queueing..." : "Retry charge"}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm leading-7 text-white/66">
              No charge matches the current filter.
            </p>
          )}
        </DarkCard>
      </div>
    </div>
  );
}
