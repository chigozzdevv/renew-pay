"use client";

import { useEffect, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useAuthedResource } from "@/components/dashboard/use-authed-resource";
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
  completeWorkspaceOnboarding,
  loadOnboardingState,
  saveOnboardingBusinessProfile,
  saveOnboardingGovernance,
  saveOnboardingPayoutWallet,
  startOnboardingVerification,
  type OnboardingState,
} from "@/lib/onboarding";

function toErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}

function toBadgeTone(status: string) {
  if (status === "approved" || status === "complete") {
    return "brand" as const;
  }

  if (status === "current" || status === "pending") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function OnboardingSurface() {
  const { token, refresh: refreshSession, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const { data, isLoading, error, reload } = useAuthedResource(
    async ({ token }) =>
      loadOnboardingState({
        token,
        environment: mode,
      }),
    [mode]
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [businessDraft, setBusinessDraft] = useState<OnboardingState["businessProfile"] | null>(null);
  const [payoutWallet, setPayoutWallet] = useState("");

  useEffect(() => {
    if (!data) {
      return;
    }

    setBusinessDraft(data.businessProfile);
    setPayoutWallet(data.payout.payoutWallet);
  }, [data]);

  useEffect(() => {
    if (!actionMessage && !actionError) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActionMessage(null);
      setActionError(null);
    }, 4200);

    return () => window.clearTimeout(timeout);
  }, [actionError, actionMessage]);

  async function runAction(actionKey: string, runner: () => Promise<void>) {
    setBusyAction(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      await runner();
      await reload();
      await refreshSession();
    } catch (mutationError) {
      setActionError(toErrorMessage(mutationError));
    } finally {
      setBusyAction(null);
    }
  }

  if (isLoading || !businessDraft || !data || !token) {
    return (
      <PageState
        title="Preparing workspace onboarding"
        message="Loading the current workspace requirements for identity, verification, payouts, and governance."
      />
    );
  }

  if (error) {
    return (
      <PageState
        title="Unable to load onboarding"
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
      <div className="overflow-hidden rounded-[2.4rem] border border-[#d3e4cf] bg-[radial-gradient(circle_at_top_left,_rgba(217,246,188,0.78),_rgba(244,247,241,0.96)_52%,_rgba(255,255,255,0.98)_100%)] p-6 shadow-[0_24px_80px_rgba(12,74,39,0.08)] sm:p-7">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="brand">{mode === "live" ? "Live onboarding" : "Test onboarding"}</Badge>
            <Badge tone={data.canComplete ? "brand" : "warning"}>
              {data.canComplete ? "Ready to complete" : "Action required"}
            </Badge>
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-semibold tracking-[-0.06em] text-[color:var(--ink)] sm:text-[2.6rem]">
              {user?.name ? `${user.name.split(/\s+/)[0]}, ` : ""}complete your workspace setup.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-[color:var(--muted)] sm:text-[15px]">
              Verify your identity, configure a payout wallet, and optionally enable governance before unlocking billing operations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.steps.map((step) => (
              <Badge key={step.key} tone={toBadgeTone(step.status)}>
                {step.label}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {actionMessage ? (
        <PageState title="Updated" message={actionMessage} />
      ) : null}
      {actionError ? (
        <PageState title="Action failed" message={actionError} tone="danger" />
      ) : null}

      <StatGrid>
        <MetricCard
          label="Owner KYC"
          value={data.verification.ownerKyc.status.replace(/_/g, " ")}
          note={mode === "test" ? "Required in sandbox" : "Required for live access"}
          tone={data.verification.ownerKyc.status === "approved" ? "brand" : "neutral"}
        />
        <MetricCard
          label="Merchant KYB"
          value={data.verification.required.merchantKyb ? data.verification.merchantKyb.status.replace(/_/g, " ") : "Not required"}
          note={mode === "live" ? "Live mode only" : "Skipped in test mode"}
          tone={
            !data.verification.required.merchantKyb ||
            data.verification.merchantKyb.status === "approved"
              ? "brand"
              : "neutral"
          }
        />
        <MetricCard
          label="Payout wallet"
          value={data.payout.payoutConfigured ? "Configured" : "Missing"}
          note="Required before treasury withdrawals"
          tone={data.payout.payoutConfigured ? "brand" : "neutral"}
        />
        <MetricCard
          label="Governance"
          value={data.governance.enabled ? "Enabled" : "Single owner"}
          note="Advanced, optional"
          tone={data.governance.enabled ? "brand" : "neutral"}
        />
      </StatGrid>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card
          title="Business Basics"
          description="Name, support email, timezone, and active markets."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Business name</span>
              <Input
                value={businessDraft.businessName}
                onChange={(event) =>
                  setBusinessDraft((current) =>
                    current ? { ...current, businessName: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Support email</span>
              <Input
                type="email"
                value={businessDraft.supportEmail}
                onChange={(event) =>
                  setBusinessDraft((current) =>
                    current ? { ...current, supportEmail: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Billing timezone</span>
              <Input
                value={businessDraft.billingTimezone}
                onChange={(event) =>
                  setBusinessDraft((current) =>
                    current ? { ...current, billingTimezone: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Default market</span>
              <Select
                value={businessDraft.defaultMarket}
                onChange={(event) =>
                  setBusinessDraft((current) =>
                    current ? { ...current, defaultMarket: event.target.value } : current
                  )
                }
              >
                {businessDraft.supportedMarkets.map((market) => (
                  <option key={market} value={market}>
                    {market}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 sm:col-span-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">
                Supported markets
              </span>
              <Input
                value={businessDraft.supportedMarkets.join(", ")}
                onChange={(event) =>
                  setBusinessDraft((current) =>
                    current
                      ? {
                          ...current,
                          supportedMarkets: event.target.value
                            .split(",")
                            .map((entry) => entry.trim().toUpperCase())
                            .filter(Boolean),
                        }
                      : current
                  )
                }
                placeholder="NGN, GHS, KES"
              />
            </label>
          </div>
          <div className="mt-5">
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "business"}
              onClick={() =>
                void runAction("business", async () => {
                  await saveOnboardingBusinessProfile({
                    token,
                    environment: mode,
                    businessName: businessDraft.businessName,
                    supportEmail: businessDraft.supportEmail,
                    billingTimezone: businessDraft.billingTimezone,
                    supportedMarkets: businessDraft.supportedMarkets,
                    defaultMarket: businessDraft.defaultMarket,
                  });
                  setActionMessage("Business profile saved.");
                })
              }
            >
              {busyAction === "business" ? "Saving..." : "Save business profile"}
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card
            title="Verification"
            description={
              mode === "live"
                ? "Owner KYC and merchant KYB required for live operations."
                : "Owner KYC required in sandbox mode."
            }
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Owner KYC</p>
                  <p className="text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    {data.verification.ownerKyc.status.replace(/_/g, " ")}
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={busyAction === "owner-kyc"}
                  onClick={() =>
                    void runAction("owner-kyc", async () => {
                      const result = await startOnboardingVerification({
                        token,
                        environment: mode,
                        subject: "owner_kyc",
                      });
                      setActionMessage(
                        result.sdkAccessToken
                          ? "Owner KYC session started. Complete it in the verification flow and then refresh."
                          : "Owner KYC session started."
                      );
                    })
                  }
                >
                  {busyAction === "owner-kyc" ? "Starting..." : "Start owner KYC"}
                </Button>
              </div>

              {mode === "live" ? (
                <div className="flex items-center justify-between rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--ink)]">Merchant KYB</p>
                    <p className="text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
                      {data.verification.merchantKyb.status.replace(/_/g, " ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    disabled={busyAction === "merchant-kyb"}
                    onClick={() =>
                      void runAction("merchant-kyb", async () => {
                        const result = await startOnboardingVerification({
                          token,
                          environment: mode,
                          subject: "merchant_kyb",
                        });
                        setActionMessage(
                          result.sdkAccessToken
                            ? "Merchant KYB session started. Complete it in the verification flow and then refresh."
                            : "Merchant KYB session started."
                        );
                      })
                    }
                  >
                    {busyAction === "merchant-kyb" ? "Starting..." : "Start merchant KYB"}
                  </Button>
                </div>
              ) : null}

              <Button type="button" onClick={() => void reload()}>
                Refresh verification status
              </Button>
            </div>
          </Card>

          <Card
            title="Payout Wallet"
            description="Withdrawals go to this address only. Set it once, change it via treasury governance."
          >
            <div className="space-y-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[color:var(--ink)]">Payout wallet</span>
                <Input
                  value={payoutWallet}
                  onChange={(event) => setPayoutWallet(event.target.value)}
                  placeholder="Enter Solana token account"
                />
              </label>
              <Button
                type="button"
                tone="brand"
                disabled={busyAction === "payout"}
                onClick={() =>
                  void runAction("payout", async () => {
                    await saveOnboardingPayoutWallet({
                      token,
                      environment: mode,
                      payoutWallet,
                    });
                    setActionMessage("Payout wallet saved.");
                  })
                }
              >
                {busyAction === "payout" ? "Saving..." : "Save payout wallet"}
              </Button>
            </div>
          </Card>

          <Card
            title="Governance"
            description="Optional. Enable advanced governance for treasury actions that should require more than one approval."
          >
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                tone={data.governance.enabled ? "brand" : "neutral"}
                disabled={busyAction === "governance-on"}
                onClick={() =>
                  void runAction("governance-on", async () => {
                    await saveOnboardingGovernance({
                      token,
                      environment: mode,
                      enabled: true,
                    });
                    setActionMessage("Advanced governance enabled.");
                  })
                }
              >
                {busyAction === "governance-on" ? "Saving..." : "Enable governance"}
              </Button>
              <Button
                type="button"
                disabled={busyAction === "governance-off"}
                onClick={() =>
                  void runAction("governance-off", async () => {
                    await saveOnboardingGovernance({
                      token,
                      environment: mode,
                      enabled: false,
                    });
                    setActionMessage("Workspace kept in single-owner mode.");
                  })
                }
              >
                {busyAction === "governance-off" ? "Saving..." : "Keep it off"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Card
        title="Complete Setup"
        description="Verification approved and payout wallet set — you're ready."
        action={
          <Button
            type="button"
            tone="brand"
            disabled={!data.canComplete || busyAction === "complete"}
            onClick={() =>
              void runAction("complete", async () => {
                await completeWorkspaceOnboarding({
                  token,
                  environment: mode,
                });
                setActionMessage("Workspace onboarding completed.");
              })
            }
          >
            {busyAction === "complete" ? "Completing..." : "Activate workspace"}
          </Button>
        }
      >
        {null}
      </Card>
    </section>
  );
}
