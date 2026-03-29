"use client";

import { useEffect, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useResource } from "@/components/dashboard/use-resource";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  LoadingState,
  MetricCard,
  Modal,
  PageState,
  Select,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import { ApiError } from "@/lib/api";
import {
  loadPayoutWorkspace,
  previewPayoutBatch,
  updatePayoutSettings,
  withdrawTreasuryBalance,
  type TreasuryPayoutOverview,
  type PayoutBatch,
} from "@/lib/treasury";

function toErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function formatUsdc(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatAddress(value: string) {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

type PayoutSettingsDraft = {
  payoutMode: "manual" | "automatic";
  autoPayoutFrequency: "daily" | "weekly" | "monthly" | null;
  autoPayoutTimeLocal: string;
  thresholdPayoutEnabled: boolean;
  autoPayoutThresholdUsdc: string;
};

function createSettingsDraft(data: TreasuryPayoutOverview): PayoutSettingsDraft {
  return {
    payoutMode: data.payoutMode === "automatic" ? "automatic" : "manual",
    autoPayoutFrequency:
      data.autoPayoutFrequency === "daily" ||
      data.autoPayoutFrequency === "weekly" ||
      data.autoPayoutFrequency === "monthly"
        ? data.autoPayoutFrequency
        : null,
    autoPayoutTimeLocal: data.autoPayoutTimeLocal || "09:00",
    thresholdPayoutEnabled: data.thresholdPayoutEnabled,
    autoPayoutThresholdUsdc:
      data.autoPayoutThresholdUsdc !== null ? String(data.autoPayoutThresholdUsdc) : "",
  };
}

function statusTone(status: string) {
  if (status === "executed") return "brand" as const;
  if (status === "pending_governance") return "warning" as const;
  return "neutral" as const;
}

export default function TreasuryPage() {
  const { token } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadPayoutWorkspace({ token, merchantId, environment: mode }),
    [mode]
  );
  const [preview, setPreview] = useState<PayoutBatch | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<PayoutSettingsDraft | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSettingsDraft(createSettingsDraft(data));
  }, [data]);

  useEffect(() => {
    if (!actionMessage && !actionError) return;
    const timeout = window.setTimeout(() => {
      setActionMessage(null);
      setActionError(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [actionMessage, actionError]);

  async function runAction(actionKey: string, runner: () => Promise<void>) {
    setBusyAction(actionKey);
    setActionMessage(null);
    setActionError(null);
    try {
      await runner();
      await reload();
    } catch (mutationError) {
      setActionError(toErrorMessage(mutationError));
    } finally {
      setBusyAction(null);
    }
  }

  if (isLoading || !data || !settingsDraft || !token) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <PageState
        title="Unable to load treasury"
        message={error}
        tone="danger"
        action={
          <Button type="button" tone="brand" onClick={() => void reload()}>
            Retry
          </Button>
        }
      />
    );
  }

  const openBatches = data.batches.filter(
    (b) => b.status === "open" || b.status === "pending_governance"
  ).length;

  return (
    <section className="space-y-6">
      <StatGrid>
        <MetricCard
          label="Available balance"
          value={`${formatUsdc(data.availableBalanceUsdc)} USDC`}
          note="Eligible to withdraw now"
        />
        <MetricCard
          label="Pending settlement"
          value={`${formatUsdc(data.pendingSettlementUsdc)} USDC`}
          note="Still confirming before payout"
        />
        <MetricCard
          label="Payout wallet"
          value={formatAddress(data.payoutWallet)}
          note="Withdrawals only go here"
        />
        <MetricCard
          label="Payout mode"
          value={data.payoutMode === "automatic" ? "Automatic" : "Manual"}
          note={
            data.payoutMode === "automatic"
              ? `${data.autoPayoutFrequency ?? "No frequency"} at ${data.autoPayoutTimeLocal}`
              : "Merchant-controlled"
          }
        />
      </StatGrid>

      <Card
        title="Withdraw"
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowSettings(true)}>Payout settings</Button>
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "preview"}
              onClick={() =>
                void runAction("preview", async () => {
                  const nextPreview = await previewPayoutBatch({
                    token,
                    merchantId: data.merchantId,
                    environment: mode,
                    trigger: "manual",
                  });
                  setPreview(nextPreview.preview);
                  setActionMessage(
                    nextPreview.preview
                      ? `Prepared ${nextPreview.preview.settlementCount} settlement${nextPreview.preview.settlementCount === 1 ? "" : "s"} for withdrawal.`
                      : "No eligible settlements are ready to withdraw yet."
                  );
                })
              }
            >
              {busyAction === "preview" ? "Preparing..." : "Preview withdraw"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {actionMessage ? <p className="text-sm text-[color:var(--brand)]">{actionMessage}</p> : null}
          {actionError ? <p className="text-sm text-[#a8382b]">{actionError}</p> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Destination" value={<span className="truncate">{data.payoutWallet}</span>} />
            <Field label="Open batches" value={String(openBatches)} />
            <Field
              label="Threshold"
              value={
                data.thresholdPayoutEnabled
                  ? `${formatUsdc(data.autoPayoutThresholdUsdc ?? 0)} USDC`
                  : "Disabled"
              }
            />
          </div>

          {preview ? (
            <div className="rounded-[1.4rem] border border-[color:var(--line)] bg-[#faf9f5] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--ink)]">
                    {preview.settlementCount} settlement{preview.settlementCount === 1 ? "" : "s"} ready
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    Gross {formatUsdc(preview.grossUsdc)}, fees {formatUsdc(preview.feeUsdc)}, net {formatUsdc(preview.netUsdc)} USDC
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(preview.status)}>{preview.status.replace(/_/g, " ")}</Badge>
                  <Button
                    type="button"
                    tone="brand"
                    disabled={busyAction === "withdraw"}
                    onClick={() =>
                      void runAction("withdraw", async () => {
                        const result = await withdrawTreasuryBalance({
                          token,
                          merchantId: data.merchantId,
                          environment: mode,
                          trigger: "manual",
                        });
                        setPreview(result.batch);
                        setActionMessage(
                          result.batch.status === "pending_governance"
                            ? "Withdrawal queued for governance approval."
                            : "Withdrawal executed."
                        );
                      })
                    }
                  >
                    {busyAction === "withdraw" ? "Withdrawing..." : "Withdraw now"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card
        title="Payouts"
      >
        {data.batches.length === 0 ? (
          <p className="py-6 text-center text-sm text-[color:var(--muted)]">
            No payout batches yet. Withdraw to create the first batch.
          </p>
        ) : (
          <Table columns={["Batch", "Net amount", "Destination", "Status"]}>
            {data.batches.map((batch) => (
              <TableRow key={batch.id} columns={4}>
                <div>
                  <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                    {batch.settlementCount} settlement{batch.settlementCount === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    {formatDateTime(batch.executedAt ?? batch.openedAt)} · {batch.trigger}
                  </p>
                </div>
                <p className="self-center text-sm font-semibold text-[color:var(--ink)]">
                  {formatUsdc(batch.netUsdc)} USDC
                </p>
                <p className="self-center text-sm text-[color:var(--muted)]">
                  {formatAddress(batch.destinationWallet)}
                </p>
                <div className="self-center">
                  <Badge tone={statusTone(batch.status)}>
                    {batch.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </TableRow>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Payout settings"
        description="Configure automatic payout rules."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "settings"}
              onClick={() =>
                void runAction("settings", async () => {
                  await updatePayoutSettings({
                    token,
                    merchantId: data.merchantId,
                    environment: mode,
                    payoutMode: settingsDraft.payoutMode,
                    autoPayoutFrequency:
                      settingsDraft.payoutMode === "automatic"
                        ? settingsDraft.autoPayoutFrequency
                        : null,
                    autoPayoutTimeLocal: settingsDraft.autoPayoutTimeLocal,
                    thresholdPayoutEnabled: settingsDraft.thresholdPayoutEnabled,
                    autoPayoutThresholdUsdc: settingsDraft.thresholdPayoutEnabled
                      ? Number(settingsDraft.autoPayoutThresholdUsdc || "0")
                      : null,
                  });
                  setShowSettings(false);
                  setActionMessage("Payout settings saved.");
                })
              }
            >
              {busyAction === "settings" ? "Saving..." : "Save settings"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">Payout mode</label>
              <Select
                value={settingsDraft.payoutMode}
                onChange={(e) =>
                  setSettingsDraft((c) =>
                    c ? { ...c, payoutMode: e.target.value === "automatic" ? "automatic" : "manual" } : c
                  )
                }
              >
                <option value="manual">Manual</option>
                <option value="automatic">Automatic</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">Frequency</label>
              <Select
                value={settingsDraft.autoPayoutFrequency ?? ""}
                disabled={settingsDraft.payoutMode !== "automatic"}
                onChange={(e) =>
                  setSettingsDraft((c) =>
                    c
                      ? {
                          ...c,
                          autoPayoutFrequency:
                            e.target.value === "daily" || e.target.value === "weekly" || e.target.value === "monthly"
                              ? e.target.value
                              : null,
                        }
                      : c
                  )
                }
              >
                <option value="">Select frequency</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">Time</label>
              <Input
                value={settingsDraft.autoPayoutTimeLocal}
                disabled={settingsDraft.payoutMode !== "automatic"}
                onChange={(e) =>
                  setSettingsDraft((c) => (c ? { ...c, autoPayoutTimeLocal: e.target.value } : c))
                }
                placeholder="09:00"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">Threshold trigger</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  tone={settingsDraft.thresholdPayoutEnabled ? "brand" : "neutral"}
                  className="flex-1"
                  onClick={() =>
                    setSettingsDraft((c) => (c ? { ...c, thresholdPayoutEnabled: true } : c))
                  }
                >
                  Enabled
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() =>
                    setSettingsDraft((c) => (c ? { ...c, thresholdPayoutEnabled: false } : c))
                  }
                >
                  Disabled
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">Threshold amount (USDC)</label>
            <Input
              value={settingsDraft.autoPayoutThresholdUsdc}
              disabled={!settingsDraft.thresholdPayoutEnabled}
              onChange={(e) =>
                setSettingsDraft((c) => (c ? { ...c, autoPayoutThresholdUsdc: e.target.value } : c))
              }
              placeholder="250"
            />
          </div>
        </div>
      </Modal>
    </section>
  );
}
