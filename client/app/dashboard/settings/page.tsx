"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useResource } from "@/components/dashboard/use-resource";
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
import { ImageUpload } from "@/components/shared/image-upload";
import { Logo } from "@/components/shared/logo";
import { ApiError } from "@/lib/api";
import { loadBillingMarketCatalog } from "@/lib/markets";
import { updateMerchantSupportedMarkets } from "@/lib/merchants";
import {
  loadNotificationTemplatePreview,
  loadNotificationTemplates,
} from "@/lib/notifications";
import {
  confirmPrimaryWalletChange,
  loadWorkspaceSettings,
  promoteReserveWallet,
  removeReserveWallet,
  saveWalletSettings,
  updateWorkspaceSettings,
  type WorkspaceSettings,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

type SettingsTabKey =
  | "workspace"
  | "billing"
  | "wallets"
  | "notifications"
  | "access";

type BusinessDraft = WorkspaceSettings["business"];
type BillingDraft = WorkspaceSettings["billing"];
type NotificationsDraft = WorkspaceSettings["notifications"];
type SecurityDraft = WorkspaceSettings["security"];

function formatAddress(value: string | null) {
  if (!value) {
    return "Not configured";
  }

  if (value.length < 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
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

function formatOperationLabel(kind: string) {
  const labels: Record<string, string> = {
    payout_wallet_change_request: "Primary wallet change",
    payout_wallet_change_confirm: "Primary wallet confirmation",
    reserve_wallet_update: "Reserve wallet update",
    reserve_wallet_clear: "Reserve wallet removal",
    reserve_wallet_promote: "Reserve wallet promotion",
    governance_threshold_change: "Governance threshold change",
    governance_owner_add: "Governance approver added",
    governance_owner_remove: "Governance approver removed",
    settlement_sweep: "Settlement sweep",
  };

  return labels[kind] ?? kind.replace(/_/g, " ");
}

function formatOperationTone(status: string) {
  if (status === "executed" || status === "approved") {
    return "brand" as const;
  }

  if (status === "rejected") {
    return "danger" as const;
  }

  if (status === "pending_signatures") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function toErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}

export default function SettingsPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadWorkspaceSettings({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );
  const { data: marketCatalog, reload: reloadMarketCatalog } = useResource(
    async ({ token, merchantId }) =>
      loadBillingMarketCatalog({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );
  const { data: notificationTemplates } = useResource(
    async ({ token, merchantId }) =>
      loadNotificationTemplates({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );

  const [activeTab, setActiveTab] = useState<SettingsTabKey>("workspace");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showWalletEditor, setShowWalletEditor] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>(
    "customer.payment.receipt"
  );

  const [businessDraft, setBusinessDraft] = useState<BusinessDraft | null>(null);
  const [billingDraft, setBillingDraft] = useState<BillingDraft | null>(null);
  const [notificationsDraft, setNotificationsDraft] = useState<NotificationsDraft | null>(null);
  const [securityDraft, setSecurityDraft] = useState<SecurityDraft | null>(null);
  const [walletDraft, setWalletDraft] = useState({
    primaryWallet: "",
    reserveWallet: "",
    walletAlerts: true,
  });
  const [supportedMarketsDraft, setSupportedMarketsDraft] = useState<string[]>([]);

  useEffect(() => {
    if (!data) {
      return;
    }

    setBusinessDraft(data.business);
    setBillingDraft(data.billing);
    setNotificationsDraft(data.notifications);
    setSecurityDraft(data.security);
    setWalletDraft({
      primaryWallet: data.wallets.primaryWallet,
      reserveWallet: data.wallets.reserveWallet ?? "",
      walletAlerts: data.wallets.walletAlerts,
    });
  }, [data]);

  useEffect(() => {
    if (!marketCatalog) {
      return;
    }

    setSupportedMarketsDraft(marketCatalog.merchantSupportedMarkets);
  }, [marketCatalog]);

  useEffect(() => {
    if (!notificationTemplates?.length) {
      return;
    }

    if (!notificationTemplates.some((entry) => entry.key === selectedTemplateKey)) {
      setSelectedTemplateKey(notificationTemplates[0]?.key ?? "customer.payment.receipt");
    }
  }, [notificationTemplates, selectedTemplateKey]);

  const { data: notificationPreview } = useResource(
    async ({ token, merchantId }) => {
      if (!selectedTemplateKey) {
        return null;
      }

      return loadNotificationTemplatePreview({
        token,
        merchantId,
        templateKey: selectedTemplateKey,
        environment: mode,
      });
    },
    [mode, selectedTemplateKey]
  );

  useEffect(() => {
    if (!actionMessage && !actionError) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActionMessage(null);
      setActionError(null);
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [actionError, actionMessage]);

  const pendingOperations = data?.treasury.pendingOperations ?? [];
  const pendingCount = pendingOperations.filter(
    (operation) => operation.status === "pending_signatures" || operation.status === "approved",
  ).length;

  const tabs = useMemo(
    () =>
      [
        { key: "workspace", label: "Business" },
        { key: "billing", label: "Billing" },
        { key: "wallets", label: "Wallets" },
        { key: "notifications", label: "Notifications" },
        { key: "access", label: "Access" },
      ] satisfies Array<{ key: SettingsTabKey; label: string }>,
    [],
  );

  async function runMutation(actionKey: string, runner: () => Promise<void>) {
    setBusyAction(actionKey);
    setActionMessage(null);
    setActionError(null);

    try {
      await runner();
      await reload();
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function patchBusiness<K extends keyof BusinessDraft>(key: K, value: BusinessDraft[K]) {
    setBusinessDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function patchSupportedMarkets(nextMarkets: string[]) {
    setSupportedMarketsDraft(nextMarkets);
    setBusinessDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        defaultMarket: nextMarkets.includes(current.defaultMarket)
          ? current.defaultMarket
          : (nextMarkets[0] ?? ""),
      };
    });
  }

  function patchBilling<K extends keyof BillingDraft>(key: K, value: BillingDraft[K]) {
    setBillingDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function patchNotifications<K extends keyof NotificationsDraft>(
    key: K,
    value: NotificationsDraft[K],
  ) {
    setNotificationsDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function patchSecurity<K extends keyof SecurityDraft>(key: K, value: SecurityDraft[K]) {
    setSecurityDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleWorkspaceSave() {
    if (!token || !user?.merchantId || !businessDraft || supportedMarketsDraft.length === 0) {
      return;
    }

    await runMutation("workspace-save", async () => {
      await updateMerchantSupportedMarkets({
        token,
        merchantId: user.merchantId,
        supportedMarkets: supportedMarketsDraft,
      });
      await updateWorkspaceSettings({
        token,
        merchantId: user.merchantId,
        environment: mode,
        payload: { business: businessDraft },
      });
      await reloadMarketCatalog();
      setActionMessage("Workspace settings saved.");
    });
  }

  async function handleBillingSave() {
    if (!token || !user?.merchantId || !billingDraft) {
      return;
    }

    await runMutation("billing-save", async () => {
      await updateWorkspaceSettings({
        token,
        merchantId: user.merchantId,
        environment: mode,
        payload: { billing: billingDraft },
      });
      setActionMessage("Billing defaults saved.");
    });
  }

  async function handleNotificationsSave() {
    if (!token || !user?.merchantId || !notificationsDraft) {
      return;
    }

    await runMutation("notifications-save", async () => {
      await updateWorkspaceSettings({
        token,
        merchantId: user.merchantId,
        environment: mode,
        payload: { notifications: notificationsDraft },
      });
      setActionMessage("Notification settings saved.");
    });
  }

  async function handleSecuritySave() {
    if (!token || !user?.merchantId || !securityDraft) {
      return;
    }

    await runMutation("security-save", async () => {
      await updateWorkspaceSettings({
        token,
        merchantId: user.merchantId,
        environment: mode,
        payload: { security: securityDraft },
      });
      setActionMessage("Access policy saved.");
    });
  }

  async function handleWalletSave() {
    if (!token || !user?.merchantId) {
      return;
    }

    await runMutation("wallet-save", async () => {
      const result = await saveWalletSettings({
        token,
        merchantId: user.merchantId,
        environment: mode,
        primaryWallet: walletDraft.primaryWallet.trim(),
        reserveWallet: walletDraft.reserveWallet.trim() || null,
        walletAlerts: walletDraft.walletAlerts,
      });
      const queuedCount = result.operations.length;
      setActionMessage(
        queuedCount > 0
          ? `${queuedCount} treasury approval${queuedCount === 1 ? "" : "s"} queued.`
          : "Wallet settings saved.",
      );
      setShowWalletEditor(false);
    });
  }

  async function handleConfirmPendingPrimary() {
    if (!token || !user?.merchantId) {
      return;
    }

    await runMutation("wallet-confirm", async () => {
      await confirmPrimaryWalletChange({
        token,
        merchantId: user.merchantId,
        environment: mode,
      });
      setActionMessage("Primary wallet confirmation queued for approvals.");
    });
  }

  async function handlePromoteReserve() {
    if (!token || !user?.merchantId) {
      return;
    }

    await runMutation("wallet-promote", async () => {
      await promoteReserveWallet({
        token,
        merchantId: user.merchantId,
        environment: mode,
      });
      setActionMessage("Reserve wallet promotion queued for approvals.");
    });
  }

  async function handleRemoveReserve() {
    if (!token || !user?.merchantId) {
      return;
    }

    await runMutation("wallet-remove", async () => {
      await removeReserveWallet({
        token,
        merchantId: user.merchantId,
        environment: mode,
      });
      setActionMessage("Reserve wallet removal queued for approvals.");
      setShowWalletEditor(false);
    });
  }

  if (isLoading) {
    return (
      <PageState
        title="Loading settings"
        message="Fetching business settings and treasury controls."
      />
    );
  }

  if (error || !data || !businessDraft || !billingDraft || !notificationsDraft || !securityDraft) {
    return (
      <PageState
        title="Settings unavailable"
        message={error ?? "Workspace settings could not be loaded."}
        tone="danger"
        action={
          <Button type="button" onClick={() => void reload()}>
            Retry
          </Button>
        }
      />
    );
  }

  const availableMarkets = marketCatalog?.markets ?? [];
  const supportedMarketOptions = availableMarkets.filter((market) =>
    supportedMarketsDraft.includes(market.currency)
  );

  return (
    <div className="space-y-4">
      <StatGrid>
        <MetricCard
          label="Primary market"
          value={data.business.defaultMarket}
          note="Workspace billing default"
          tone="brand"
        />
        <MetricCard
          label="Treasury control"
          value={data.wallets.governanceVaultAddress ? "Governed" : "Single owner"}
          note={
            data.wallets.governanceVaultAddress
              ? "Protected wallet changes route through governance"
              : "Default owner controls are active"
          }
        />
        <MetricCard
          label="Pending approvals"
          value={String(pendingCount)}
          note="Treasury operations awaiting execution"
        />
        <MetricCard
          label="Wallet alerts"
          value={data.wallets.walletAlerts ? "On" : "Off"}
          note="Operator warning policy"
        />
      </StatGrid>

      <Card title="Settings">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-all duration-200",
                activeTab === tab.key
                  ? "bg-[#0c4a27] text-[#d9f6bc]"
                  : "border border-[color:var(--line)] bg-white text-[color:var(--muted)] hover:bg-[#f7fbf5]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {actionMessage ? (
          <div className="mt-4 rounded-2xl border border-[#0c4a27]/10 bg-[#edf7eb] px-4 py-3 text-sm text-[color:var(--brand)]">
            {actionMessage}
          </div>
        ) : null}

        {actionError ? (
          <div className="mt-4 rounded-2xl border border-[#dcb7b0] bg-[#fff7f6] px-4 py-3 text-sm text-[#922f25]">
            {actionError}
          </div>
        ) : null}
      </Card>

      {activeTab === "workspace" ? (
        <Card title="Business settings">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr] xl:items-start">
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <SettingsField label="Business name">
                  <Input
                    value={businessDraft.name}
                    onChange={(event) => patchBusiness("name", event.target.value)}
                  />
                </SettingsField>

                <SettingsField label="Support email">
                  <Input
                    type="email"
                    value={businessDraft.supportEmail}
                    onChange={(event) => patchBusiness("supportEmail", event.target.value)}
                  />
                </SettingsField>

                <SettingsField label="Primary market">
                  <Select
                    value={businessDraft.defaultMarket}
                    onChange={(event) => patchBusiness("defaultMarket", event.target.value)}
                  >
                    {supportedMarketOptions.length === 0 ? (
                      <option value="">Select a market</option>
                    ) : null}
                    {supportedMarketOptions.map((market) => (
                      <option key={market.currency} value={market.currency}>
                        {market.currency}
                      </option>
                    ))}
                  </Select>
                </SettingsField>

                <SettingsField label="Invoice prefix">
                  <Input
                    value={businessDraft.invoicePrefix}
                    onChange={(event) => patchBusiness("invoicePrefix", event.target.value.toUpperCase())}
                  />
                </SettingsField>

                <SettingsField label="Billing timezone">
                  <Select
                    value={businessDraft.billingTimezone}
                    onChange={(event) => patchBusiness("billingTimezone", event.target.value)}
                  >
                    <option value="UTC">UTC</option>
                    <option value="Africa/Lagos">Africa/Lagos</option>
                    <option value="Africa/Nairobi">Africa/Nairobi</option>
                  </Select>
                </SettingsField>

                <SettingsField label="Billing display">
                  <Select
                    value={businessDraft.billingDisplay}
                    onChange={(event) => patchBusiness("billingDisplay", event.target.value)}
                  >
                    <option value="local-fiat">Customer local fiat</option>
                    <option value="usd-reference">USD reference</option>
                  </Select>
                </SettingsField>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SettingsField label="Statement descriptor">
                  <Input
                    value={businessDraft.statementDescriptor}
                    onChange={(event) =>
                      patchBusiness("statementDescriptor", event.target.value.toUpperCase())
                    }
                  />
                </SettingsField>

                <SettingsField label="Customer billing domain">
                  <Input
                    value={businessDraft.customerDomain}
                    onChange={(event) => patchBusiness("customerDomain", event.target.value)}
                  />
                </SettingsField>

                <SettingsField label="Fallback currency">
                  <Select
                    value={businessDraft.fallbackCurrency}
                    onChange={(event) => patchBusiness("fallbackCurrency", event.target.value)}
                  >
                    <option value="USDC">USDC</option>
                    <option value="USD">USD</option>
                  </Select>
                </SettingsField>

                <SettingsField label="Brand accent">
                  <Select
                    value={businessDraft.brandAccent}
                    onChange={(event) => patchBusiness("brandAccent", event.target.value)}
                  >
                    <option value="forest-green">Forest green</option>
                    <option value="dark-green">Dark green</option>
                    <option value="neutral">Neutral</option>
                  </Select>
                </SettingsField>

                <SettingsField label="Brand logo">
                  <ImageUpload
                    token={token}
                    value={businessDraft.logoUrl}
                    alt={`${businessDraft.name} logo`}
                    onChange={(nextValue) => patchBusiness("logoUrl", nextValue)}
                    disabled={busyAction === "workspace-save"}
                  />
                </SettingsField>
              </div>


            </div>

            <div className="space-y-5 rounded-[1.5rem] border border-[color:var(--line)] bg-[#f7fbf5] p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Brand preview
                </p>
                <div className="mt-4 flex h-20 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4">
                  {businessDraft.logoUrl ? (
                    <img
                      src={businessDraft.logoUrl}
                      alt={`${businessDraft.name} logo`}
                      className="max-h-10 w-auto object-contain"
                    />
                  ) : (
                    <Logo />
                  )}
                </div>
              </div>

              <SettingsField label="Invoice footer note">
                <textarea
                  value={businessDraft.invoiceFooter}
                  onChange={(event) => patchBusiness("invoiceFooter", event.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--ink)] outline-none"
                />
              </SettingsField>

              <div className="grid gap-3 sm:grid-cols-3">
                <SettingsMiniStat label="Display" value={businessDraft.billingDisplay} />
                <SettingsMiniStat label="Fallback" value={businessDraft.fallbackCurrency} />
                <SettingsMiniStat label="Timezone" value={businessDraft.billingTimezone} />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "workspace-save" || supportedMarketsDraft.length === 0}
              onClick={() => void handleWorkspaceSave()}
            >
              Save business settings
            </Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "billing" ? (
        <Card title="Billing defaults">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr] xl:items-start">
            <div className="grid gap-4 md:grid-cols-2">
              <SettingsField label="Retry policy">
                <Select
                  value={billingDraft.retryPolicy}
                  onChange={(event) => patchBilling("retryPolicy", event.target.value)}
                >
                  <option value="Smart retries">Smart retries</option>
                  <option value="3 retries over 5 days">3 retries over 5 days</option>
                  <option value="2 retries over 3 days">2 retries over 3 days</option>
                  <option value="No automatic retries">No automatic retries</option>
                </Select>
              </SettingsField>

              <SettingsField label="Invoice grace days">
                <Input
                  type="number"
                  min="0"
                  max="30"
                  value={String(billingDraft.invoiceGraceDays)}
                  onChange={(event) =>
                    patchBilling("invoiceGraceDays", Number.parseInt(event.target.value || "0", 10))
                  }
                />
              </SettingsField>

              <SettingsField label="Auto retries">
                <SettingsToggle
                  label={billingDraft.autoRetries ? "Enabled" : "Disabled"}
                  description="Retry failed renewals using the workspace policy."
                  enabled={billingDraft.autoRetries}
                  onToggle={() => patchBilling("autoRetries", !billingDraft.autoRetries)}
                />
              </SettingsField>

              <SettingsField label="Meter approval">
                <SettingsToggle
                  label={billingDraft.meterApproval ? "Required" : "Optional"}
                  description="Require usage sign-off before metered billing runs."
                  enabled={billingDraft.meterApproval}
                  onToggle={() => patchBilling("meterApproval", !billingDraft.meterApproval)}
                />
              </SettingsField>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsMiniStat label="Retry" value={billingDraft.retryPolicy} />
              <SettingsMiniStat label="Grace" value={`${billingDraft.invoiceGraceDays} day(s)`} />
              <SettingsMiniStat label="Auto retries" value={billingDraft.autoRetries ? "On" : "Off"} />
              <SettingsMiniStat
                label="Meter approval"
                value={billingDraft.meterApproval ? "Required" : "Optional"}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "billing-save"}
              onClick={() => void handleBillingSave()}
            >
              Save billing defaults
            </Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "wallets" ? (
        <Card title="Wallet management">
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr] xl:items-start">
            <div className="space-y-4">
              <SettingsSummaryRow
                label="Governance vault"
                value={formatAddress(data.wallets.governanceVaultAddress)}
                badge={data.wallets.governanceVaultAddress ? "Connected" : "Not configured"}
                tone={data.wallets.governanceVaultAddress ? "brand" : "neutral"}
              />
              <SettingsSummaryRow
                label="Primary payout wallet"
                value={formatAddress(data.wallets.primaryWallet)}
                badge="Primary"
                tone="brand"
              />
              <SettingsSummaryRow
                label="Reserve wallet"
                value={formatAddress(data.wallets.reserveWallet)}
                badge={data.wallets.reserveWallet ? "Standby" : "Not configured"}
              />

              {data.wallets.pendingPayoutWallet ? (
                <div className="rounded-2xl border border-[#d9e7d6] bg-[#edf7eb] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand)]">
                        Pending primary wallet
                      </p>
                      <p className="mt-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                        {formatAddress(data.wallets.pendingPayoutWallet)}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">
                        Ready at {formatDateTime(data.wallets.payoutWalletChangeReadyAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      tone="brand"
                      disabled={busyAction === "wallet-confirm"}
                      onClick={() => void handleConfirmPendingPrimary()}
                    >
                      Queue confirm
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-[#f7fbf5] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Pending treasury operations
                    </p>
                    <p className="mt-2 text-sm text-[color:var(--muted)]">
                      Advanced approval history now lives in Governance instead of the old Treasury approvals flow.
                    </p>
                  </div>
                  <Link
                    href="/dashboard/governance"
                    className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]"
                  >
                    Open governance
                  </Link>
                </div>

                <div className="mt-4 space-y-3">
                  {pendingOperations.length > 0 ? (
                    pendingOperations.map((operation) => (
                      <div
                        key={operation.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                            {formatOperationLabel(operation.kind)}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                            {operation.id.slice(-8)}
                          </p>
                        </div>
                        <Badge tone={formatOperationTone(operation.status)}>
                          {operation.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[color:var(--line)] bg-white px-4 py-5 text-sm text-[color:var(--muted)]">
                      No pending treasury operations.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-[color:var(--line)] bg-[#f7fbf5] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Wallet editor
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    Queue wallet updates through treasury approvals instead of mutating payout addresses directly.
                  </p>
                </div>
                <Button type="button" onClick={() => setShowWalletEditor((current) => !current)}>
                  {showWalletEditor ? "Hide editor" : "Edit wallets"}
                </Button>
              </div>

              <SettingsToggle
                label="Wallet alerts"
                description="Notify operators when payout wallets require attention."
                enabled={walletDraft.walletAlerts}
                onToggle={() =>
                  setWalletDraft((current) => ({
                    ...current,
                    walletAlerts: !current.walletAlerts,
                  }))
                }
              />

              {showWalletEditor ? (
                <div className="space-y-4">
                  <SettingsField label="Primary payout wallet">
                    <Input
                      value={walletDraft.primaryWallet}
                      onChange={(event) =>
                        setWalletDraft((current) => ({
                          ...current,
                          primaryWallet: event.target.value,
                        }))
                      }
                    />
                  </SettingsField>

                  <SettingsField label="Reserve wallet">
                    <Input
                      value={walletDraft.reserveWallet}
                      onChange={(event) =>
                        setWalletDraft((current) => ({
                          ...current,
                          reserveWallet: event.target.value,
                        }))
                      }
                    />
                  </SettingsField>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      type="button"
                      tone="brand"
                      disabled={busyAction === "wallet-save"}
                      onClick={() => void handleWalletSave()}
                    >
                      Queue wallet change
                    </Button>
                    <Button
                      type="button"
                      disabled={!data.wallets.reserveWallet || busyAction === "wallet-remove"}
                      onClick={() => void handleRemoveReserve()}
                    >
                      Remove reserve
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  disabled={!data.wallets.reserveWallet || busyAction === "wallet-promote"}
                  onClick={() => void handlePromoteReserve()}
                >
                  Promote reserve
                </Button>
                <Link
                  href="/dashboard/governance"
                  className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]"
                >
                  Open governance
                </Link>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {activeTab === "notifications" ? (
        <Card title="Notifications">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr] xl:items-start">
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <SettingsToggle
                  label="Customer subscription emails"
                  description="Send confirmation and lifecycle updates to customers."
                  enabled={notificationsDraft.customerSubscriptionEmails}
                  onToggle={() =>
                    patchNotifications(
                      "customerSubscriptionEmails",
                      !notificationsDraft.customerSubscriptionEmails
                    )
                  }
                />
                <SettingsToggle
                  label="Customer receipts"
                  description="Send a receipt after successful subscription payments."
                  enabled={notificationsDraft.customerReceiptEmails}
                  onToggle={() =>
                    patchNotifications(
                      "customerReceiptEmails",
                      !notificationsDraft.customerReceiptEmails
                    )
                  }
                />
                <SettingsToggle
                  label="Customer follow-ups"
                  description="Send reminders and failed-payment follow-up emails."
                  enabled={notificationsDraft.customerPaymentFollowUps}
                  onToggle={() =>
                    patchNotifications(
                      "customerPaymentFollowUps",
                      !notificationsDraft.customerPaymentFollowUps
                    )
                  }
                />
                <SettingsToggle
                  label="Merchant subscription alerts"
                  description="Alert the workspace when new subscriptions start."
                  enabled={notificationsDraft.merchantSubscriptionAlerts}
                  onToggle={() =>
                    patchNotifications(
                      "merchantSubscriptionAlerts",
                      !notificationsDraft.merchantSubscriptionAlerts
                    )
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SettingsField label="Merchant payment digest">
                  <Select
                    value={notificationsDraft.merchantPaymentDigestFrequency}
                    onChange={(event) =>
                      patchNotifications(
                        "merchantPaymentDigestFrequency",
                        event.target.value as NotificationsDraft["merchantPaymentDigestFrequency"]
                      )
                    }
                  >
                    <option value="off">Off</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </Select>
                </SettingsField>

                <SettingsField label="Digest detail">
                  <Select
                    value={notificationsDraft.merchantPaymentDigestMode}
                    onChange={(event) =>
                      patchNotifications(
                        "merchantPaymentDigestMode",
                        event.target.value as NotificationsDraft["merchantPaymentDigestMode"]
                      )
                    }
                  >
                    <option value="counts">Counts only</option>
                    <option value="detailed">Detailed rows</option>
                  </Select>
                </SettingsField>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <SettingsToggle
                  label="Team invite emails"
                  description="Send invite and reminder emails to invited teammates."
                  enabled={notificationsDraft.teamInviteEmails}
                  onToggle={() =>
                    patchNotifications("teamInviteEmails", !notificationsDraft.teamInviteEmails)
                  }
                />
                <SettingsToggle
                  label="Governance alerts"
                  description="Notify approvers when governance actions need attention."
                  enabled={notificationsDraft.governanceAlerts}
                  onToggle={() =>
                    patchNotifications(
                      "governanceAlerts",
                      !notificationsDraft.governanceAlerts
                    )
                  }
                />
                <SettingsToggle
                  label="Treasury alerts"
                  description="Notify finance and ops when payout actions progress."
                  enabled={notificationsDraft.treasuryAlerts}
                  onToggle={() =>
                    patchNotifications("treasuryAlerts", !notificationsDraft.treasuryAlerts)
                  }
                />
                <SettingsToggle
                  label="Verification alerts"
                  description="Notify admins when KYC or KYB status changes."
                  enabled={notificationsDraft.verificationAlerts}
                  onToggle={() =>
                    patchNotifications(
                      "verificationAlerts",
                      !notificationsDraft.verificationAlerts
                    )
                  }
                />
                <SettingsToggle
                  label="Developer alerts"
                  description="Notify engineering when keys or webhook health changes."
                  enabled={notificationsDraft.developerAlerts}
                  onToggle={() =>
                    patchNotifications("developerAlerts", !notificationsDraft.developerAlerts)
                  }
                />
                <SettingsToggle
                  label="Security alerts"
                  description="Alert admins when sensitive workspace access events occur."
                  enabled={notificationsDraft.securityAlerts}
                  onToggle={() =>
                    patchNotifications("securityAlerts", !notificationsDraft.securityAlerts)
                  }
                />
              </div>
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-[color:var(--line)] bg-[#f7fbf5] p-5">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Email preview
                </p>
                <Select
                  value={selectedTemplateKey}
                  onChange={(event) => setSelectedTemplateKey(event.target.value)}
                >
                  {(notificationTemplates ?? []).map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Subject
                </p>
                <p className="mt-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                  {notificationPreview?.subject ?? "Loading preview..."}
                </p>
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  {notificationPreview?.description ??
                    "Preview a rendered template with current workspace branding."}
                </p>
              </div>

              <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--line)] bg-white">
                {notificationPreview ? (
                  <iframe
                    title="Notification preview"
                    srcDoc={notificationPreview.html}
                    className="h-[540px] w-full bg-white"
                  />
                ) : (
                  <div className="px-4 py-8 text-sm text-[color:var(--muted)]">
                    Loading preview...
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "notifications-save"}
              onClick={() => void handleNotificationsSave()}
            >
              Save notifications
            </Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "access" ? (
        <Card title="Access policy">
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr] xl:items-start">
            <div className="space-y-4">
              <SettingsField label="Session timeout">
                <Select
                  value={securityDraft.sessionTimeout}
                  onChange={(event) => patchSecurity("sessionTimeout", event.target.value)}
                >
                  <option value="30 minutes">30 minutes</option>
                  <option value="1 hour">1 hour</option>
                  <option value="4 hours">4 hours</option>
                </Select>
              </SettingsField>

              <SettingsField label="Invite domain policy">
                <Input
                  value={securityDraft.inviteDomainPolicy}
                  onChange={(event) => patchSecurity("inviteDomainPolicy", event.target.value)}
                />
              </SettingsField>

              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsToggle
                  label="Enforce two-factor"
                  description="Require stronger login checks for sensitive roles."
                  enabled={securityDraft.enforceTwoFactor}
                  onToggle={() =>
                    patchSecurity("enforceTwoFactor", !securityDraft.enforceTwoFactor)
                  }
                />
                <SettingsToggle
                  label="Restrict invite domains"
                  description="Only allow invites from approved company domains."
                  enabled={securityDraft.restrictInviteDomains}
                  onToggle={() =>
                    patchSecurity("restrictInviteDomains", !securityDraft.restrictInviteDomains)
                  }
                />
              </div>
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-[color:var(--line)] bg-[#f7fbf5] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Governance
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    Approvers, thresholds, and protected treasury controls now live outside Settings.
                  </p>
                </div>
                <Badge tone={data.wallets.governanceVaultAddress ? "brand" : "neutral"}>
                  {data.wallets.governanceVaultAddress ? "Governance active" : "Hidden by default"}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsMiniStat
                  label="Wallet mode"
                  value={data.wallets.governanceVaultAddress ? "Governed" : "Single owner"}
                />
                <SettingsMiniStat
                  label="Pending approvals"
                  value={String(pendingCount)}
                />
              </div>

              <Link
                href="/dashboard/governance"
                className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]"
              >
                Open governance
              </Link>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "security-save"}
              onClick={() => void handleSecuritySave()}
            >
              Save access policy
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function SettingsField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}

function SettingsMiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
        {value}
      </p>
    </div>
  );
}

function SettingsSummaryRow({
  label,
  value,
  badge,
  tone = "neutral",
}: {
  label: string;
  value: string;
  badge?: string;
  tone?: "neutral" | "brand";
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            {label}
          </p>
          <p className="mt-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
            {value}
          </p>
        </div>
        {badge ? <Badge tone={tone}>{badge}</Badge> : null}
      </div>
    </div>
  );
}

function SettingsToggle({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{label}</p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
            enabled ? "bg-[#0c4a27]" : "bg-[#d9e4d6]",
          )}
          aria-pressed={enabled}
        >
          <span
            className={cn(
              "absolute top-1 h-5 w-5 rounded-full bg-white transition-transform duration-200",
              enabled ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>
    </div>
  );
}
