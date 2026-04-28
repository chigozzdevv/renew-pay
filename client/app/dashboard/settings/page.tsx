"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { MarketMultiSelect } from "@/components/dashboard/market-controls";
import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Badge,
  Button,
  Card,
  Input,
  InlineLoading,
  LoadingState,
  PageState,
  Select,
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
  loadWorkspaceSettings,
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
      await saveWalletSettings({
        token,
        merchantId: user.merchantId,
        environment: mode,
        primaryWallet: walletDraft.primaryWallet.trim(),
        walletAlerts: walletDraft.walletAlerts,
      });
      setActionMessage("Wallet settings saved.");
      setShowWalletEditor(false);
    });
  }

  if (isLoading) {
    return <LoadingState />;
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
                  ? "bg-[#111111] text-white"
                  : "border border-[color:var(--line)] bg-white text-[color:var(--muted)] hover:bg-[#f8f8fb]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {actionMessage ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-[#f8f8fb] px-4 py-3 text-sm text-[color:var(--brand)]">
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
        <Card title="Workspace">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:items-start">
            <div className="space-y-4">
              <SettingsPanel title="Business profile">
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

                  <SettingsField label="Invoice prefix">
                    <Input
                      value={businessDraft.invoicePrefix}
                      onChange={(event) =>
                        patchBusiness("invoicePrefix", event.target.value.toUpperCase())
                      }
                    />
                  </SettingsField>

                  <SettingsField label="Customer billing domain">
                    <Input
                      value={businessDraft.customerDomain}
                      onChange={(event) => patchBusiness("customerDomain", event.target.value)}
                    />
                  </SettingsField>
                </div>
              </SettingsPanel>

              <SettingsPanel title="Billing identity">
                <div className="grid gap-4 md:grid-cols-2">
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

                  <SettingsField label="Fallback currency">
                    <Select
                      value={businessDraft.fallbackCurrency}
                      onChange={(event) => patchBusiness("fallbackCurrency", event.target.value)}
                    >
                      <option value="USDC">USDC</option>
                      <option value="USD">USD</option>
                    </Select>
                  </SettingsField>

                  <SettingsField label="Statement descriptor">
                    <Input
                      value={businessDraft.statementDescriptor}
                      onChange={(event) =>
                        patchBusiness("statementDescriptor", event.target.value.toUpperCase())
                      }
                    />
                  </SettingsField>
                </div>
              </SettingsPanel>

              <SettingsPanel title="Supported markets">
                <MarketMultiSelect
                  options={availableMarkets}
                  value={supportedMarketsDraft}
                  onChange={patchSupportedMarkets}
                  allLabel="All available markets"
                  placeholder="Select supported markets"
                />
              </SettingsPanel>
            </div>

            <div className="space-y-4">
              <SettingsPanel title="Branding">
                <div className="space-y-4">
                  <SettingsField label="Brand logo">
                    <ImageUpload
                      token={token}
                      value={businessDraft.logoUrl}
                      alt={`${businessDraft.name} logo`}
                      onChange={(nextValue) => patchBusiness("logoUrl", nextValue)}
                      disabled={busyAction === "workspace-save"}
                    />
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

                  <SettingsField label="Invoice footer note">
                    <textarea
                      value={businessDraft.invoiceFooter}
                      onChange={(event) => patchBusiness("invoiceFooter", event.target.value)}
                      rows={4}
                      className="w-full resize-none rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--ink)] outline-none"
                    />
                  </SettingsField>
                </div>
              </SettingsPanel>

              <SettingsPanel title="Preview">
                <div className="space-y-4">
                  <div className="flex h-20 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4">
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

                  <div className="grid gap-3 sm:grid-cols-3">
                    <SettingsMiniStat label="Display" value={businessDraft.billingDisplay} />
                    <SettingsMiniStat label="Fallback" value={businessDraft.fallbackCurrency} />
                    <SettingsMiniStat label="Timezone" value={businessDraft.billingTimezone} />
                  </div>
                </div>
              </SettingsPanel>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "workspace-save" || supportedMarketsDraft.length === 0}
              onClick={() => void handleWorkspaceSave()}
            >
              Save workspace
            </Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "billing" ? (
        <Card title="Billing defaults">
          <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
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
                  enabled={billingDraft.autoRetries}
                  onToggle={() => patchBilling("autoRetries", !billingDraft.autoRetries)}
                />
              </SettingsField>

              <SettingsField label="Meter approval">
                <SettingsToggle
                  label={billingDraft.meterApproval ? "Required" : "Optional"}
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
        <Card title="Wallets">
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr] xl:items-start">
            <div className="space-y-4">
              <SettingsSummaryRow
                label="Primary payout wallet"
                value={formatAddress(data.wallets.primaryWallet)}
                badge="Primary"
                tone="brand"
              />
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-[color:var(--line)] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Wallet editor
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    Update payout destinations used for stable settlement.
                  </p>
                </div>
                <Button type="button" onClick={() => setShowWalletEditor((current) => !current)}>
                  {showWalletEditor ? "Hide editor" : "Edit wallets"}
                </Button>
              </div>

              <SettingsToggle
                label="Wallet alerts"
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

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      tone="brand"
                      disabled={busyAction === "wallet-save"}
                      onClick={() => void handleWalletSave()}
                    >
                      Save wallet settings
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {activeTab === "notifications" ? (
        <Card title="Notifications">
          <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <SettingsToggle
                  label="Customer subscription emails"
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
                  enabled={notificationsDraft.teamInviteEmails}
                  onToggle={() =>
                    patchNotifications("teamInviteEmails", !notificationsDraft.teamInviteEmails)
                  }
                />
                <SettingsToggle
                  label="Verification alerts"
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
                  enabled={notificationsDraft.developerAlerts}
                  onToggle={() =>
                    patchNotifications("developerAlerts", !notificationsDraft.developerAlerts)
                  }
                />
                <SettingsToggle
                  label="Security alerts"
                  enabled={notificationsDraft.securityAlerts}
                  onToggle={() =>
                    patchNotifications("securityAlerts", !notificationsDraft.securityAlerts)
                  }
                />
              </div>
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-[color:var(--line)] bg-white p-5">
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
                <div className="mt-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                  {notificationPreview?.subject ? (
                    notificationPreview.subject
                  ) : (
                    <InlineLoading label="Preparing preview" />
                  )}
                </div>
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
                  <div className="flex min-h-[320px] items-center justify-center px-4 py-8">
                    <InlineLoading label="Preparing preview" />
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
                  enabled={securityDraft.enforceTwoFactor}
                  onToggle={() =>
                    patchSecurity("enforceTwoFactor", !securityDraft.enforceTwoFactor)
                  }
                />
                <SettingsToggle
                  label="Restrict invite domains"
                  enabled={securityDraft.restrictInviteDomains}
                  onToggle={() =>
                    patchSecurity("restrictInviteDomains", !securityDraft.restrictInviteDomains)
                  }
                />
              </div>
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-[color:var(--line)] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Team access
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    Role defaults and invite policies keep workspace access predictable.
                  </p>
                </div>
                <Badge tone={securityDraft.enforceTwoFactor ? "brand" : "neutral"}>
                  {securityDraft.enforceTwoFactor ? "2FA required" : "2FA optional"}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsMiniStat
                  label="Session timeout"
                  value={securityDraft.sessionTimeout}
                />
                <SettingsMiniStat
                  label="Invite domains"
                  value={securityDraft.restrictInviteDomains ? "Restricted" : "Open"}
                />
              </div>
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

function SettingsPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {title}
      </p>
      <div className="mt-4">{children}</div>
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
  enabled,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{label}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
            enabled ? "bg-[#111111]" : "bg-[#d9d6cf]",
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
