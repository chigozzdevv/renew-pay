"use client";

import { useEffect, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useAuthedResource } from "@/components/dashboard/use-authed-resource";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import {
  Badge,
  Button,
  Card,
  Input,
  MetricCard,
  PageState,
  Select,
  StatGrid,
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
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}

function formatUsdc(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not executed";
  }

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
  if (value.length < 12) {
    return value;
  }

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
  if (status === "executed") {
    return "brand" as const;
  }

  if (status === "pending_governance") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function TreasuryEarningsSurface() {
  const { token } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const { data, isLoading, error, reload } = useAuthedResource(
    async ({ token, merchantId }) =>
      loadPayoutWorkspace({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );
  const [preview, setPreview] = useState<PayoutBatch | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<PayoutSettingsDraft | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) {
      return;
    }

    setSettingsDraft(createSettingsDraft(data));
  }, [data]);

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
    return (
      <PageState
        title="Loading treasury"
        message="Fetching available balance, payout settings, and payout batch history."
      />
    );
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

  return (
    <section className="space-y-6">
      {actionMessage ? <PageState title="Updated" message={actionMessage} /> : null}
      {actionError ? (
        <PageState title="Action failed" message={actionError} tone="danger" />
      ) : null}

      <StatGrid>
        <MetricCard
          label="Available balance"
          value={`${formatUsdc(data.availableBalanceUsdc)} USDC`}
          note="Eligible to withdraw now"
          tone="brand"
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

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card
          title="Withdraw"
          description="Batch all eligible unswept settlements into one payout to the approved payout wallet."
          action={
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
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Destination
              </p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                {data.payoutWallet}
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Open payout batches
              </p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                {
                  data.batches.filter((batch) => batch.status === "open" || batch.status === "pending_governance")
                    .length
                }
              </p>
            </div>
          </div>

          {preview ? (
            <div className="mt-5 rounded-[1.6rem] border border-[color:var(--line)] bg-[#f7fbf5] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--ink)]">
                    {preview.settlementCount} settlement{preview.settlementCount === 1 ? "" : "s"} ready
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    Gross {formatUsdc(preview.grossUsdc)} USDC, fees {formatUsdc(preview.feeUsdc)} USDC,
                    net {formatUsdc(preview.netUsdc)} USDC
                  </p>
                </div>
                <Badge tone={statusTone(preview.status)}>{preview.status.replace(/_/g, " ")}</Badge>
              </div>
              <div className="mt-4">
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
                          ? "Withdrawal batch queued for governance approval."
                          : "Withdrawal batch executed."
                      );
                    })
                  }
                >
                  {busyAction === "withdraw" ? "Withdrawing..." : "Withdraw now"}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card
          title="Auto-Payout Settings"
          description="Manual stays default. Automatic payouts can run on a merchant-chosen frequency with an optional threshold trigger."
        >
          <div className="space-y-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Payout mode</span>
              <Select
                value={settingsDraft.payoutMode}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current
                      ? {
                          ...current,
                          payoutMode: event.target.value === "automatic" ? "automatic" : "manual",
                        }
                      : current
                  )
                }
              >
                <option value="manual">Manual</option>
                <option value="automatic">Automatic</option>
              </Select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Frequency</span>
              <Select
                value={settingsDraft.autoPayoutFrequency ?? ""}
                disabled={settingsDraft.payoutMode !== "automatic"}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current
                      ? {
                          ...current,
                          autoPayoutFrequency:
                            event.target.value === "daily" ||
                            event.target.value === "weekly" ||
                            event.target.value === "monthly"
                              ? event.target.value
                              : null,
                        }
                      : current
                  )
                }
              >
                <option value="">Select frequency</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Time</span>
              <Input
                value={settingsDraft.autoPayoutTimeLocal}
                disabled={settingsDraft.payoutMode !== "automatic"}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current ? { ...current, autoPayoutTimeLocal: event.target.value } : current
                  )
                }
                placeholder="09:00"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">
                Threshold trigger
              </span>
              <div className="flex gap-3">
                <Button
                  type="button"
                  tone={settingsDraft.thresholdPayoutEnabled ? "brand" : "neutral"}
                  onClick={() =>
                    setSettingsDraft((current) =>
                      current ? { ...current, thresholdPayoutEnabled: true } : current
                    )
                  }
                >
                  Enabled
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    setSettingsDraft((current) =>
                      current ? { ...current, thresholdPayoutEnabled: false } : current
                    )
                  }
                >
                  Disabled
                </Button>
              </div>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">
                Threshold amount (USDC)
              </span>
              <Input
                value={settingsDraft.autoPayoutThresholdUsdc}
                disabled={!settingsDraft.thresholdPayoutEnabled}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current ? { ...current, autoPayoutThresholdUsdc: event.target.value } : current
                  )
                }
                placeholder="250"
              />
            </label>

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
                  setActionMessage("Treasury payout settings saved.");
                })
              }
            >
              {busyAction === "settings" ? "Saving..." : "Save payout settings"}
            </Button>
          </div>
        </Card>
      </div>

      <Card
        title="Payout Batch History"
        description="Individual settlements remain the reconciliation layer. Withdrawals operate on merchant payout batches."
      >
        {data.batches.length === 0 ? (
          <PageState
            title="No payout batches yet"
            message="Once settlements reach the treasury and you withdraw, the payout history will show up here."
          />
        ) : (
          <div className="space-y-3">
            {data.batches.map((batch) => (
              <div
                key={batch.id}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">
                        {batch.settlementCount} settlement{batch.settlementCount === 1 ? "" : "s"}
                      </p>
                      <Badge tone={statusTone(batch.status)}>
                        {batch.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-[color:var(--muted)]">
                      Net {formatUsdc(batch.netUsdc)} USDC to {formatAddress(batch.destinationWallet)}
                    </p>
                  </div>
                  <div className="text-right text-sm text-[color:var(--muted)]">
                    <p>{formatDateTime(batch.executedAt ?? batch.openedAt)}</p>
                    <p className="mt-1 uppercase tracking-[0.12em]">{batch.trigger}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
