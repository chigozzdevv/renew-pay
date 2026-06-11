"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { SumsubVerificationModal } from "@/components/dashboard/sumsub-verification-modal";
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
import {
  loadVerificationSummary,
  startOwnerVerification,
  type VerificationStatus,
} from "@/lib/verification";
import {
  checkStellarUsdcTrustline,
  connectStellarWallet,
  enableStellarUsdcTrustline,
  type StellarUsdcTrustlineStatus,
} from "@/lib/stellar-wallet";
import { cn } from "@/lib/utils";

type SettingsTabKey =
  | "workspace"
  | "checkout"
  | "developers"
  | "verification"
  | "settlement"
  | "notifications";

type BusinessDraft = WorkspaceSettings["business"];
type CheckoutDraft = WorkspaceSettings["checkout"];
type NotificationsDraft = WorkspaceSettings["notifications"];

const settingsTabKeys = [
  "workspace",
  "verification",
  "checkout",
  "developers",
  "settlement",
  "notifications",
] as const satisfies readonly SettingsTabKey[];

function isSettingsTabKey(value: string | null): value is SettingsTabKey {
  return settingsTabKeys.includes(value as SettingsTabKey);
}

function readTabFromLocation() {
  if (typeof window === "undefined") {
    return null;
  }

  const tab = new URLSearchParams(window.location.search).get("tab");

  return tab === "wallets" ? "settlement" : tab;
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
  const {
    data: verificationData,
    isLoading: isVerificationLoading,
    error: verificationError,
    reload: reloadVerification,
  } = useResource(
    async ({ token, merchantId }) =>
      loadVerificationSummary({
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
  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  const [businessDraft, setBusinessDraft] = useState<BusinessDraft | null>(null);
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft | null>(null);
  const [notificationsDraft, setNotificationsDraft] = useState<NotificationsDraft | null>(null);
  const [walletDraft, setWalletDraft] = useState({
    primaryWallet: "",
    walletAlerts: true,
  });
  const [walletTrustline, setWalletTrustline] =
    useState<StellarUsdcTrustlineStatus | null>(null);
  const [walletStatusError, setWalletStatusError] = useState<string | null>(null);
  const [isCheckingWallet, setIsCheckingWallet] = useState(false);

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
    setWalletDraft({
      primaryWallet: data.wallets.primaryWallet,
      walletAlerts: data.wallets.walletAlerts,
    });
  }, [data]);

  useEffect(() => {
    const address = walletDraft.primaryWallet.trim();

    if (!address) {
      setWalletTrustline(null);
      setWalletStatusError(null);
      setIsCheckingWallet(false);
      return;
    }

    let isCurrent = true;

    setIsCheckingWallet(true);
    setWalletStatusError(null);
    void checkStellarUsdcTrustline(mode, address)
      .then((status) => {
        if (!isCurrent) {
          return;
        }

        setWalletTrustline(status);
      })
      .catch((error) => {
        if (!isCurrent) {
          return;
        }

        setWalletTrustline(null);
        setWalletStatusError(toErrorMessage(error));
      })
      .finally(() => {
        if (isCurrent) {
          setIsCheckingWallet(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [mode, walletDraft.primaryWallet]);

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
        { key: "verification", label: "Verification" },
        { key: "checkout", label: "Checkout" },
        { key: "developers", label: "Developers" },
        { key: "settlement", label: "Settlement" },
        { key: "notifications", label: "Notifications" },
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

  async function runVerificationAction(actionKey: string, runner: () => Promise<void>) {
    setBusyAction(actionKey);
    setActionMessage(null);
    setActionError(null);

    try {
      await runner();
      await reloadVerification();
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
      setActionMessage("Saved.");
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
        payload: {
          notifications: {
            paymentAlerts: notificationsDraft.paymentAlerts,
            settlementAlerts: notificationsDraft.settlementAlerts,
          },
        },
      });
      setActionMessage("Saved.");
    });
  }

  async function handleCheckoutSave() {
    if (!token || !user?.merchantId || !checkoutDraft || !businessDraft) {
      return;
    }

    await runMutation("checkout-save", async () => {
      await updateWorkspaceSettings({
        token,
        merchantId: user.merchantId,
        environment: mode,
        payload: {
          business: {
            customerDomain: businessDraft.customerDomain,
          },
          checkout: checkoutDraft,
        },
      });
      setActionMessage("Saved.");
    });
  }

  async function saveConnectedWallet(address: string) {
    if (!token || !user?.merchantId) {
      return;
    }

    await saveWalletSettings({
      token,
      merchantId: user.merchantId,
      environment: mode,
      primaryWallet: address.trim(),
      walletAlerts: walletDraft.walletAlerts,
    });
  }

  async function handleWalletConnect() {
    setBusyAction("wallet-connect");
    setActionMessage(null);
    setActionError(null);
    setWalletStatusError(null);

    try {
      const address = await connectStellarWallet(mode);
      const status = await checkStellarUsdcTrustline(mode, address);

      setWalletDraft((current) => ({
        ...current,
        primaryWallet: address,
      }));
      setWalletTrustline(status);

      if (!status.funded) {
        setActionError("Fund this Stellar wallet with XLM first.");
        return;
      }

      if (!status.trusted) {
        setActionMessage("Wallet connected.");
        return;
      }

      await saveConnectedWallet(address);
      await reload();
      setActionMessage("Wallet connected.");
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWalletEnableUsdc() {
    setBusyAction("wallet-enable");
    setActionMessage(null);
    setActionError(null);
    setWalletStatusError(null);

    try {
      const address = walletDraft.primaryWallet.trim();

      await enableStellarUsdcTrustline(mode, address);
      const status = await checkStellarUsdcTrustline(mode, address);
      setWalletTrustline(status);

      if (status.trusted) {
        await saveConnectedWallet(address);
        await reload();
      }

      setActionMessage("USDC enabled.");
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStartOwnerVerification() {
    if (!token || !user?.merchantId) {
      return;
    }

    await runVerificationAction("owner-kyc", async () => {
      const result = await startOwnerVerification({
        token,
        merchantId: user.merchantId,
        environment: mode,
      });
      const sessionToken = result.sessionToken?.trim();
      const verificationUrl = result.verificationUrl?.trim();

      if (sessionToken) {
        setVerificationToken(sessionToken);
        return;
      }

      if (verificationUrl) {
        window.location.assign(verificationUrl);
        return;
      }

      throw new Error("Verification did not return a session.");
    });
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !data || !businessDraft || !checkoutDraft || !notificationsDraft) {
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
      <Card>
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
        <Card>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="shrink-0 sm:w-48">
              <ImageUpload
                token={token}
                value={businessDraft.logoUrl}
                alt={`${businessDraft.name} logo`}
                onChange={(nextValue) => patchBusiness("logoUrl", nextValue)}
                disabled={busyAction === "workspace-save"}
                variant="compact"
              />
            </div>

            <div className="grid flex-1 gap-4 sm:grid-cols-2">
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
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "workspace-save"}
              onClick={() => void handleWorkspaceSave()}
            >
              Save
            </Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "settlement" ? (
        <Card>
          <div className="max-w-xl space-y-4">
            <div className="rounded-lg border border-[color:var(--line)] bg-white px-4 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[color:var(--muted)]">
                    Settlement wallet
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-[color:var(--ink)]">
                    {walletDraft.primaryWallet
                      ? formatAddress(walletDraft.primaryWallet)
                      : "No wallet connected"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {walletDraft.primaryWallet ? (
                      <Badge tone={walletTrustline?.trusted ? "brand" : "warning"}>
                        {isCheckingWallet
                          ? "Checking USDC"
                          : walletTrustline?.trusted
                            ? "USDC enabled"
                            : walletTrustline?.funded === false
                              ? "Needs XLM"
                              : "Enable USDC"}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  className="whitespace-nowrap"
                  disabled={
                    busyAction === "wallet-connect" ||
                    busyAction === "wallet-enable" ||
                    isCheckingWallet
                  }
                  onClick={() => void handleWalletConnect()}
                >
                  {busyAction === "wallet-connect"
                    ? "Connecting..."
                    : walletDraft.primaryWallet
                      ? "Change wallet"
                      : "Connect wallet"}
                </Button>
              </div>

              {walletStatusError ? (
                <p className="mt-3 text-sm font-medium text-[#9a3a31]">
                  {walletStatusError}
                </p>
              ) : null}

              {walletTrustline?.funded === false ? (
                <p className="mt-3 text-sm font-medium text-[color:var(--muted)]">
                  Fund the wallet with XLM before enabling USDC.
                </p>
              ) : null}

              {walletDraft.primaryWallet &&
              walletTrustline?.funded &&
              !walletTrustline.trusted ? (
                <Button
                  type="button"
                  className="mt-4 w-full"
                  disabled={
                    busyAction === "wallet-connect" ||
                    busyAction === "wallet-enable" ||
                    isCheckingWallet
                  }
                  onClick={() => void handleWalletEnableUsdc()}
                >
                  {busyAction === "wallet-enable" ? "Enabling..." : "Enable USDC"}
                </Button>
              ) : null}

            </div>
          </div>
        </Card>
      ) : null}

      {activeTab === "checkout" ? (
        <Card>
          <div className="grid gap-4 max-w-2xl sm:grid-cols-2">
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
                placeholder="https://example.com/orders/{ref}"
                value={checkoutDraft.returnPage ?? ""}
                onChange={(event) => patchCheckout("returnPage", event.target.value || null)}
              />
            </SettingsField>
            <SettingsField label="Checkout domain">
              <Input
                value={businessDraft.customerDomain}
                placeholder="checkout.example.com"
                onChange={(event) => patchBusiness("customerDomain", event.target.value)}
              />
            </SettingsField>
            <SettingsField label="Allowed domains">
              <Input
                placeholder="example.com"
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
              Save
            </Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "developers" ? <DevelopersSettings /> : null}

      {activeTab === "verification" ? (
        <Card>
          {isVerificationLoading ? (
            <LoadingState label="Loading verification" className="min-h-[12rem]" />
          ) : verificationError || !verificationData ? (
            <PageState
              title="Verification unavailable"
              message={verificationError ?? "Verification status could not be loaded."}
              tone="danger"
              action={
                <Button type="button" onClick={() => void reloadVerification()}>
                  Retry
                </Button>
              }
            />
          ) : (
            <div className="max-w-xl space-y-4">
              <div className="grid gap-3">
                <VerificationCard
                  title="Owner KYC"
                  status={verificationData.ownerKyc}
                  busy={busyAction === "owner-kyc"}
                  actionLabel="Start KYC"
                  onStart={() => void handleStartOwnerVerification()}
                />
              </div>
              {verificationData.ownerKyc.status === "approved" ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--line)] bg-[#f8f8fb] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--ink)]">
                      Verification complete
                    </p>
                    <p className="mt-1 text-xs font-medium text-[color:var(--muted)]">
                      Starter settlement limits
                    </p>
                  </div>
                  <Button
                    type="button"
                    disabled={busyAction === "verification-refresh"}
                    onClick={() =>
                      void runVerificationAction("verification-refresh", async () => {})
                    }
                  >
                    Refresh
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      ) : null}

      {activeTab === "notifications" ? (
        <Card>
          <div className="grid gap-3 max-w-2xl sm:grid-cols-2">
            <SettingsToggle
              label="Payment alerts"
              enabled={notificationsDraft.paymentAlerts}
              onToggle={() =>
                patchNotifications(
                  "paymentAlerts",
                  !notificationsDraft.paymentAlerts
                )
              }
            />
            <SettingsToggle
              label="Settlement alerts"
              enabled={notificationsDraft.settlementAlerts}
              onToggle={() =>
                patchNotifications(
                  "settlementAlerts",
                  !notificationsDraft.settlementAlerts
                )
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
              Save
            </Button>
          </div>
        </Card>
      ) : null}

      <SumsubVerificationModal
        open={Boolean(verificationToken)}
        accessToken={verificationToken}
        onClose={() => {
          setVerificationToken(null);
          void reloadVerification();
        }}
        onSubmitted={() => {
          setVerificationToken(null);
          void reloadVerification();
        }}
      />
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

function VerificationCard({
  title,
  status,
  busy,
  actionLabel,
  onStart,
}: {
  title: string;
  status: VerificationStatus;
  busy: boolean;
  actionLabel: string;
  onStart: () => void;
}) {
  const approved = status.status === "approved";
  const pending = ["pending", "in_review", "started", "submitted"].includes(status.status);

  return (
    <div className="rounded-lg border border-[color:var(--line)] bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[color:var(--ink)]">{title}</p>
          <div className="mt-2">
            <Badge tone={toBadgeTone(status.status)}>
              {formatVerificationStatus(status.status)}
            </Badge>
          </div>
        </div>
        <Button
          type="button"
          tone={approved ? "neutral" : "brand"}
          disabled={busy || approved}
          onClick={onStart}
        >
          {busy ? "Starting..." : approved ? "Verified" : pending ? "Continue" : actionLabel}
        </Button>
      </div>
    </div>
  );
}

function formatVerificationStatus(value: string) {
  return value.replace(/_/g, " ");
}

function toBadgeTone(value: string): "neutral" | "brand" | "warning" | "danger" {
  if (value === "approved") {
    return "brand";
  }

  if (["rejected", "declined", "failed"].includes(value)) {
    return "danger";
  }

  if (["pending", "in_review", "started", "submitted"].includes(value)) {
    return "warning";
  }

  return "neutral";
}
