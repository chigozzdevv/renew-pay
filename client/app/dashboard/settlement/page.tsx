"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Clock, ExternalLink, Eye } from "lucide-react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import {
  StatusBadge,
  formatCurrency,
  formatDateTime,
  getStellarTxUrl,
  toErrorMessage,
} from "@/components/dashboard/dashboard-utils";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Badge,
  Button,
  Card,
  LoadingState,
  MetricCard,
  Modal,
  PageState,
  RowActionButton,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import { loadPayouts, type PayoutRecord } from "@/lib/payouts";
import { loadWorkspaceSettings } from "@/lib/settings";
import {
  checkStellarUsdcTrustline,
  type StellarUsdcTrustlineStatus,
} from "@/lib/stellar-wallet";

function formatAddress(value: string | null) {
  if (!value) {
    return "Not connected";
  }

  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function isPendingSettlement(payout: PayoutRecord) {
  return ["queued", "confirming", "held"].includes(payout.status);
}

function getEarliestRelease(payouts: PayoutRecord[]) {
  return payouts.reduce<string | null>((earliest, payout) => {
    if (!isPendingSettlement(payout)) {
      return earliest;
    }

    if (!earliest) {
      return payout.scheduledFor;
    }

    return new Date(payout.scheduledFor).getTime() < new Date(earliest).getTime()
      ? payout.scheduledFor
      : earliest;
  }, null);
}

type SettlementJourneyStep = {
  title: "Deposit" | "Release";
  status: "completed" | "scheduled" | "pending" | "held" | "failed";
  label: string;
  txHash: string | null;
};

function getSettlementJourney(payout: PayoutRecord): SettlementJourneyStep[] {
  const failed = ["failed", "reversed"].includes(payout.status);
  const releaseCompleted = Boolean(payout.vaultReleaseTxHash || payout.settledAt);
  const depositCompleted = Boolean(payout.vaultDepositTxHash);

  return [
    {
      title: "Deposit",
      status: depositCompleted ? "completed" : failed ? "failed" : "pending",
      label: depositCompleted
        ? formatDateTime(payout.vaultHeldAt ?? payout.updatedAt)
        : failed
          ? "Failed"
          : "Pending",
      txHash: payout.vaultDepositTxHash,
    },
    {
      title: "Release",
      status: releaseCompleted
        ? "completed"
        : failed
          ? "failed"
          : payout.status === "held"
            ? "held"
            : depositCompleted
              ? "scheduled"
              : "pending",
      label: releaseCompleted
        ? formatDateTime(payout.settledAt ?? payout.updatedAt)
        : failed
          ? "Failed"
          : payout.status === "held"
            ? "Held"
            : depositCompleted
              ? formatDateTime(payout.scheduledFor)
              : "Pending",
      txHash: payout.vaultReleaseTxHash,
    },
  ];
}

function journeyStepTone(status: SettlementJourneyStep["status"]) {
  if (status === "completed") {
    return {
      icon: Check,
      dot: "border-[#cfe8d5] bg-[#e9f5ec] text-[#225c39]",
      label: "Completed",
      badge: "bg-[#e9f5ec] text-[#225c39]",
    };
  }

  if (status === "failed") {
    return {
      icon: AlertCircle,
      dot: "border-[#e0beb7] bg-[#fff0ef] text-[#9a3a31]",
      label: "Failed",
      badge: "bg-[#fff0ef] text-[#9a3a31]",
    };
  }

  return {
    icon: Clock,
    dot: "border-[#efd9b2] bg-[#fff6e7] text-[#76511a]",
    label: status === "held" ? "Held" : status === "scheduled" ? "Scheduled" : "Pending",
    badge: "bg-[#fff6e7] text-[#76511a]",
  };
}

function SettlementJourney({
  payout,
  mode,
}: {
  payout: PayoutRecord;
  mode: "test" | "live";
}) {
  const steps = getSettlementJourney(payout);

  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const tone = journeyStepTone(step.status);
        const Icon = tone.icon;

        return (
          <div key={step.title} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
            {index < steps.length - 1 ? (
              <span className="absolute left-4 top-9 h-[calc(100%-1rem)] w-px bg-[color:var(--line)]" />
            ) : null}
            <span
              className={`relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border ${tone.dot}`}
            >
              <Icon className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <div className="rounded-lg border border-[color:var(--line)] bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--ink)]">
                    {step.title}
                  </p>
                  <p className="mt-1 text-xs font-medium text-[color:var(--muted)]">
                    {step.label}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${tone.badge}`}
                >
                  {tone.label}
                </span>
              </div>
              {step.txHash ? (
                <a
                  href={getStellarTxUrl(mode, step.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ink)] underline decoration-black/20 underline-offset-4"
                >
                  View transaction
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.1} />
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SettlementPage() {
  const { mode } = useWorkspaceMode();
  const [detailPayout, setDetailPayout] = useState<PayoutRecord | null>(null);
  const [walletTrustline, setWalletTrustline] =
    useState<StellarUsdcTrustlineStatus | null>(null);
  const [walletStatusError, setWalletStatusError] = useState<string | null>(null);
  const [isCheckingWallet, setIsCheckingWallet] = useState(false);

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadPayouts({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );
  const { data: settingsData } = useResource(
    async ({ token, merchantId }) =>
      loadWorkspaceSettings({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );

  const payouts = data ?? [];
  const settlementWallet = settingsData?.wallets.primaryWallet ?? "";

  useEffect(() => {
    if (!settlementWallet.trim()) {
      setWalletTrustline(null);
      setWalletStatusError(null);
      setIsCheckingWallet(false);
      return;
    }

    let isCurrent = true;

    setIsCheckingWallet(true);
    setWalletStatusError(null);
    void checkStellarUsdcTrustline(mode, settlementWallet)
      .then((status) => {
        if (isCurrent) {
          setWalletTrustline(status);
        }
      })
      .catch((statusError) => {
        if (isCurrent) {
          setWalletTrustline(null);
          setWalletStatusError(toErrorMessage(statusError));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsCheckingWallet(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [mode, settlementWallet]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const pending = payouts.filter(isPendingSettlement);
    const settled30d = payouts
      .filter(
        (payout) =>
          payout.status === "settled" &&
          new Date(payout.settledAt ?? payout.updatedAt).getTime() >= thirtyDaysAgo
      )
      .reduce((sum, payout) => sum + payout.netUsdc, 0);

    return {
      pendingNet: pending.reduce((sum, payout) => sum + payout.netUsdc, 0),
      nextRelease: getEarliestRelease(payouts),
      settled30d,
      failed: payouts.filter((payout) => payout.status === "failed").length,
    };
  }, [payouts]);

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Settlement unavailable"
        message={error ?? "Unable to load settlement activity."}
        tone="danger"
        action={
          <button className="text-sm font-semibold" onClick={() => void reload()}>
            Retry
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <StatGrid>
        <MetricCard label="Pending net" value={formatCurrency(metrics.pendingNet)} />
        <MetricCard label="Next release" value={formatDateTime(metrics.nextRelease)} />
        <MetricCard label="Settled 30d" value={formatCurrency(metrics.settled30d)} />
        <MetricCard label="Failed" value={String(metrics.failed)} />
      </StatGrid>

      <Card
        title="Settlement wallet"
        action={
          <Link
            href="/dashboard/settings?tab=settlement"
            className="inline-flex items-center justify-center rounded-lg border border-[color:var(--line)] bg-white px-3.5 py-2.5 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--soft)]"
          >
            Settings
          </Link>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[color:var(--ink)]">
              {formatAddress(settlementWallet)}
            </p>
            {walletStatusError ? (
              <p className="mt-2 text-sm font-medium text-[#9a3a31]">
                {walletStatusError}
              </p>
            ) : null}
          </div>
          {settlementWallet ? (
            <Badge tone={walletTrustline?.trusted ? "brand" : "warning"}>
              {isCheckingWallet
                ? "Checking USDC"
                : walletTrustline?.trusted
                  ? "USDC enabled"
                  : walletTrustline?.funded === false
                    ? "Needs XLM"
                    : "Enable USDC"}
            </Badge>
          ) : (
            <Badge tone="warning">Not connected</Badge>
          )}
        </div>
      </Card>

      <Card title="Recent settlements">
        <Table columns={["Settlement", "Net", "Release", "Status", "Actions"]}>
          {payouts.slice(0, 12).map((payout) => (
            <TableRow key={payout.id} columns={5}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[color:var(--ink)]">
                  {payout.batchRef}
                </p>
                <p className="mt-1 text-xs text-[color:var(--muted)]">
                  {payout.commercialRef ?? payout.sourceKind}
                </p>
              </div>
              <p className="self-center text-sm font-semibold text-[color:var(--ink)]">
                {formatCurrency(payout.netUsdc)}
              </p>
              <p className="self-center text-sm text-[color:var(--muted)]">
                {formatDateTime(payout.scheduledFor)}
              </p>
              <div className="self-center">
                <StatusBadge value={payout.status} />
              </div>
              <div className="flex items-center gap-2 self-center">
                <RowActionButton
                  label="View settlement"
                  onClick={() => setDetailPayout(payout)}
                >
                  <Eye className="h-4 w-4" strokeWidth={2.1} />
                </RowActionButton>
              </div>
            </TableRow>
          ))}
        </Table>

        {payouts.length === 0 ? (
          <div className="rounded-lg border border-[color:var(--line)] bg-[#fafafd] px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[color:var(--ink)]">
              No settlements yet
            </p>
          </div>
        ) : null}
      </Card>

      <Modal
        open={!!detailPayout}
        onClose={() => setDetailPayout(null)}
        title={detailPayout?.batchRef ?? "Settlement"}
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setDetailPayout(null)}>Close</Button>
          </div>
        }
      >
        {detailPayout ? (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-lg border border-[color:var(--line)] bg-[color:var(--soft)] px-4 py-3 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-[color:var(--muted)]">Net</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                  {formatCurrency(detailPayout.netUsdc)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-[color:var(--muted)]">Status</p>
                <div className="mt-1">
                  <StatusBadge value={detailPayout.status} />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[color:var(--muted)]">Wallet</p>
                <p
                  className="mt-1 truncate text-sm font-semibold text-[color:var(--ink)]"
                  title={detailPayout.destinationWallet}
                >
                  {formatAddress(detailPayout.destinationWallet)}
                </p>
              </div>
            </div>

            <SettlementJourney payout={detailPayout} mode={mode} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
