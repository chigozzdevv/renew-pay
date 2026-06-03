"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import {
  StatusBadge,
  formatCurrency,
  formatDateTime,
  formatTxHash,
  getStellarTxUrl,
  toErrorMessage,
} from "@/components/dashboard/dashboard-utils";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Button,
  Card,
  Field,
  Input,
  LoadingState,
  MetricCard,
  Modal,
  PageState,
  RowActionButton,
  Select,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import { loadPayouts, processPayout, type PayoutRecord } from "@/lib/payouts";

type PayoutStatusFilter = PayoutRecord["status"] | "all";

export default function PayoutsPage() {
  const { token } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [status, setStatus] = useState<PayoutStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [detailPayout, setDetailPayout] = useState<PayoutRecord | null>(null);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadPayouts({
        token,
        merchantId,
        environment: mode,
        status,
        search,
      }),
    [mode, search, status]
  );

  const payouts = data ?? [];

  useEffect(() => {
    if (!message && !errorMessage) return;
    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  const metrics = useMemo(() => {
    const queued = payouts.filter((payout) => payout.status === "queued").length;
    const settled = payouts
      .filter((payout) => payout.status === "settled")
      .reduce((sum, payout) => sum + payout.netUsdc, 0);
    const failed = payouts.filter((payout) => payout.status === "failed").length;

    return {
      total: payouts.length,
      queued,
      settled,
      failed,
    };
  }, [payouts]);

  async function handleProcess(payout: PayoutRecord) {
    if (!token) return;

    setIsBusy(payout.id);
    setMessage(null);
    setErrorMessage(null);

    try {
      await processPayout({
        token,
        payoutId: payout.id,
        environment: mode,
      });
      setMessage("Payout processing started.");
      setDetailPayout(null);
      await reload();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(null);
    }
  }

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Payouts unavailable"
        message={error ?? "Unable to load payouts."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <StatGrid>
        <MetricCard label="Payouts" value={String(metrics.total)} />
        <MetricCard label="Queued" value={String(metrics.queued)} />
        <MetricCard label="Settled" value={formatCurrency(metrics.settled)} />
        <MetricCard label="Failed" value={String(metrics.failed)} />
      </StatGrid>

      <Card title="Payouts">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <Select
              value={status}
              wrapperClassName="w-40 max-w-full"
              onChange={(event) => setStatus(event.target.value as PayoutStatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="queued">Queued</option>
              <option value="confirming">Confirming</option>
              <option value="settled">Settled</option>
              <option value="failed">Failed</option>
              <option value="reversed">Reversed</option>
            </Select>
            <Input
              placeholder="Search batch or wallet"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-[#9a3a31]">{errorMessage}</p> : null}

          <Table columns={["Batch", "Net", "Destination", "Scheduled", "Status", "Actions"]}>
            {payouts.map((payout) => (
              <TableRow key={payout.id} columns={6}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{payout.batchRef}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{payout.sourceKind}</p>
                </div>
                <p className="self-center text-sm font-semibold text-[color:var(--ink)]">{formatCurrency(payout.netUsdc)}</p>
                <p className="truncate self-center text-sm text-[color:var(--muted)]">{payout.destinationWallet}</p>
                <p className="self-center text-sm text-[color:var(--muted)]">{formatDateTime(payout.scheduledFor)}</p>
                <div className="self-center">
                  <StatusBadge value={payout.status} />
                </div>
                <div className="flex items-center gap-2 self-center">
                  <RowActionButton
                    label="View payout"
                    onClick={() => setDetailPayout(payout)}
                  >
                    <Eye className="h-4 w-4" strokeWidth={2.1} />
                  </RowActionButton>
                </div>
              </TableRow>
            ))}
          </Table>
        </div>
      </Card>

      <Modal
        open={!!detailPayout}
        onClose={() => setDetailPayout(null)}
        title={detailPayout?.batchRef ?? "Payout"}
        size="lg"
        footer={
          detailPayout ? (
            <div className="flex items-center justify-between gap-3">
              <StatusBadge value={detailPayout.status} />
              <div className="flex items-center gap-3">
                <Button onClick={() => setDetailPayout(null)}>Close</Button>
                {!["settled", "reversed"].includes(detailPayout.status) ? (
                  <Button
                    tone="brand"
                    disabled={isBusy === detailPayout.id}
                    onClick={() => void handleProcess(detailPayout)}
                  >
                    {isBusy === detailPayout.id ? "Processing..." : "Process"}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null
        }
      >
        {detailPayout ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Gross" value={formatCurrency(detailPayout.grossUsdc)} />
            <Field label="Fee" value={formatCurrency(detailPayout.feeUsdc)} />
            <Field label="Net" value={formatCurrency(detailPayout.netUsdc)} />
            <Field label="Destination" value={detailPayout.destinationWallet} />
            <Field label="Scheduled" value={formatDateTime(detailPayout.scheduledFor)} />
            <Field label="Settled" value={formatDateTime(detailPayout.settledAt)} />
            <Field
              label="Transaction"
              value={
                detailPayout.creditTxHash ? (
                  <a
                    href={getStellarTxUrl(mode, detailPayout.creditTxHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-black/20 underline-offset-4"
                  >
                    {formatTxHash(detailPayout.creditTxHash)}
                  </a>
                ) : (
                  "Not set"
                )
              }
            />
            <Field label="Reason" value={detailPayout.reversalReason ?? "None"} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
