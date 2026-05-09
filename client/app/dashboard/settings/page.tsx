"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Badge,
  Button,
  Card,
  Input,
  LoadingState,
  PageState,
  Select,
} from "@/components/dashboard/ui";
import { ImageUpload } from "@/components/shared/image-upload";
import DevelopersSettings from "@/components/dashboard/developers-settings";
import { ApiError } from "@/lib/api";
import {
  loadWorkspaceSettings,
  saveWalletSettings,
  updateWorkspaceSettings,
  type WorkspaceSettings,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

type SettingsTabKey =
  | "workspace"
  | "checkout"
  | "developers"
  | "wallets"
  | "notifications"
  | "security";

type BusinessDraft = WorkspaceSettings["business"];
type CheckoutDraft = WorkspaceSettings["checkout"];
type NotificationsDraft = WorkspaceSettings["notifications"];
type SecurityDraft = WorkspaceSettings["security"];

const settingsTabKeys = [
  "workspace",
  "checkout",
  "developers",
  "wallets",
  "notifications",
  "security",
] as const satisfies readonly SettingsTabKey[];

function isSettingsTabKey(value: string | null): value is SettingsTabKey {
  return settingsTabKeys.includes(value as SettingsTabKey);
}

function readTabFromLocation() {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get("tab");
}

function formatAddress(value: string | null) {
  if (!value) {
    return "Not configured";
  }

  if (value.length < 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatCheckoutMode(value: CheckoutDraft["mode"]) {
  return value === "modal" ? "Embedded modal" : "Hosted redirect";
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
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("workspace");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [businessDraft, setBusinessDraft] = useState<BusinessDraft | null>(null);
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft | null>(null);
  const [notificationsDraft, setNotificationsDraft] = useState<NotificationsDraft | null>(null);
  const [securityDraft, setSecurityDraft] = useState<SecurityDraft | null>(null);
  const [walletDraft, setWalletDraft] = useState({
    primaryWallet: "",
    walletAlerts: true,
  });

  useEffect(() => {
    const syncTab = () => {
      const tab = readTabFromLocation();

      if (isSettingsTabKey(tab)) {
        setActiveTab(tab);
      }
    };

    syncTab();
    window.addEventListener("popstate", syncTab);

    return () => window.removeEventListener("popstate", syncTab);
  }, []);

  useEffect(() => {
    if (!data) {
      return;
    }

    setBusinessDraft(data.business);
    setCheckoutDraft(data.checkout);
    setNotificationsDraft(data.notifications);
    setSecurityDraft(data.security);
    setWalletDraft({
      primaryWallet: data.wallets.primaryWallet,
      walletAlerts: data.wallets.walletAlerts,
    });
  }, [data]);

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
        { key: "checkout", label: "Checkout" },
        { key: "developers", label: "Developers" },
        { key: "wallets", label: "Settlement" },
        { key: "notifications", label: "Notifications" },
        { key: "security", label: "Security" },
      ] satisfies Array<{ key: SettingsTabKey; label: string }>,
    [],
  );

  function selectTab(tab: SettingsTabKey) {
    const params = new URLSearchParams(window.location.search);

    if (tab === "workspace") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }

    setActiveTab(tab);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`
    );
  }

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

  function patchNotifications<K extends keyof NotificationsDraft>(
    key: K,
    value: NotificationsDraft[K],
  ) {
    setNotificationsDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function patchCheckout<K extends keyof CheckoutDraft>(key: K, value: CheckoutDraft[K]) {
    setCheckoutDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function patchSecurity<K extends keyof SecurityDraft>(key: K, value: SecurityDraft[K]) {
    setSecurityDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleWorkspaceSave() {
    if (!token || !user?.merchantId || !businessDraft) {
      return;
    }

    await runMutation("workspace-save", async () => {
      await updateWorkspaceSettings({
        token,
        merchantId: user.merchantId,
        environment: mode,
        payload: { business: businessDraft },
      });
      setActionMessage("Workspace settings saved.");
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

  async function handleCheckoutSave() {
    if (!token || !user?.merchantId || !checkoutDraft) {
      return;
    }

    await runMutation("checkout-save", async () => {
      await updateWorkspaceSettings({
        token,
        merchantId: user.merchantId,
        environment: mode,
        payload: { checkout: checkoutDraft },
      });
      setActionMessage("Checkout settings saved.");
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
      setActionMessage("Security settings saved.");
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
    });
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !data || !businessDraft || !checkoutDraft || !notificationsDraft || !securityDraft) {
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

  return (
    <div className="space-y-4">
      <Card title="Settings">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-semibold tracking-[-0.02em] transition-all duration-200",
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
        <Card title="Business">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] xl:items-start">
            <SettingsPanel title="Business details">
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

                <SettingsField label="Checkout domain">
                  <Input
                    value={businessDraft.customerDomain}
                    onChange={(event) => patchBusiness("customerDomain", event.target.value)}
                  />
                </SettingsField>
              </div>
            </SettingsPanel>

            <SettingsPanel title="Brand logo">
              <ImageUpload
                token={token}
                value={businessDraft.logoUrl}
                alt={`${businessDraft.name} logo`}
                onChange={(nextValue) => patchBusiness("logoUrl", nextValue)}
                disabled={busyAction === "workspace-save"}
              />
            </SettingsPanel>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "workspace-save"}
              onClick={() => void handleWorkspaceSave()}
            >
              Save workspace
            </Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "wallets" ? (
        <Card title="Settlement">
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr] xl:items-start">
            <div className="space-y-4">
              <SettingsSummaryRow
                label="Payout wallet"
                value={formatAddress(data.wallets.primaryWallet)}
                badge="Default"
                tone="brand"
              />
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-[color:var(--line)] bg-white p-5">
              <SettingsField label="Payout wallet">
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
                  Save settlement
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {activeTab === "checkout" ? (
        <Card title="Checkout">
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsField label="Checkout opens as">
              <Select
                value={checkoutDraft.mode}
                wrapperClassName="w-56 max-w-full"
                onChange={(event) =>
                  patchCheckout("mode", event.target.value as CheckoutDraft["mode"])
                }
              >
                <option value="modal">{formatCheckoutMode("modal")}</option>
                <option value="redirect">{formatCheckoutMode("redirect")}</option>
              </Select>
            </SettingsField>
            <SettingsField label="Return URL">
              <Input
                placeholder="https://shop.example/orders/{reference}"
                value={checkoutDraft.returnPage ?? ""}
                onChange={(event) => patchCheckout("returnPage", event.target.value || null)}
              />
            </SettingsField>
            <SettingsField label="Allowed domains">
              <Input
                placeholder="shop.example"
                value={checkoutDraft.allowedDomains.join(", ")}
                onChange={(event) =>
                  patchCheckout(
                    "allowedDomains",
                    event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean)
                  )
                }
              />
            </SettingsField>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "checkout-save"}
              onClick={() => void handleCheckoutSave()}
            >
              Save checkout
            </Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "developers" ? <DevelopersSettings /> : null}

      {activeTab === "notifications" ? (
        <Card title="Notifications">
          <div className="grid gap-3 md:grid-cols-2">
            <SettingsToggle
              label="Compliance alerts"
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

      {activeTab === "security" ? (
        <Card title="Security">
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

            <SettingsToggle
              label="Require two-factor authentication"
              enabled={securityDraft.enforceTwoFactor}
              onToggle={() =>
                patchSecurity("enforceTwoFactor", !securityDraft.enforceTwoFactor)
              }
            />
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "security-save"}
              onClick={() => void handleSecuritySave()}
            >
              Save security
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
      <p className="text-xs font-semibold text-[color:var(--muted)]">
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
      <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
        {title}
      </p>
      <div className="mt-4">{children}</div>
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
          <p className="text-xs font-semibold text-[color:var(--muted)]">
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
