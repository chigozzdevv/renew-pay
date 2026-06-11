"use client";

import { useEffect, useMemo, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { MarketMultiSelect } from "@/components/dashboard/market-controls";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useResource } from "@/components/dashboard/use-resource";
import { Badge, Button, InlineLoading, Input, LoadingState } from "@/components/dashboard/ui";
import { ImageUpload } from "@/components/shared/image-upload";
import { ApiError } from "@/lib/api";
import { loadCollectionMarketCatalog } from "@/lib/markets";
import {
  checkStellarUsdcTrustline,
  connectStellarWallet,
  enableStellarUsdcTrustline,
  type StellarUsdcTrustlineStatus,
} from "@/lib/stellar-wallet";
import {
  registerOnboardingMerchant,
  loadOnboardingState,
  saveOnboardingBusiness,
  saveOnboardingPayout,
  startOnboardingVerification,
  type OnboardingState,
} from "@/lib/onboarding";

const ONBOARDING_PRIMARY_BUTTON_CLASS =
  "!border-[#111111] !bg-[#111111] !text-white hover:!bg-[#333333]";

const STEP_KEYS = ["business", "verification", "payout", "register"] as const;

const STEP_META: Record<string, { title: string; subtitle: string }> = {
  business: {
    title: "Business basics",
    subtitle: "Tell us about your business so we can set up your workspace.",
  },
  verification: {
    title: "Verification",
    subtitle: "Complete identity verification to activate your account.",
  },
  payout: {
    title: "Settlement",
    subtitle: "Connect the Stellar wallet that receives settlement.",
  },
  register: {
    title: "Register",
    subtitle: "Finalize your merchant registration.",
  },
};

type RegisterCardState = {
  label: string;
  disabled: boolean;
  signerLabel: string;
  signerNote: string;
  onRegister?: () => void;
};

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

function formatAddress(value: string | null) {
  if (!value) {
    return "Not ready";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function useOnboardingWorkspace() {
  const { token, refresh: refreshSession, user } = useDashboardSession();
  const { mode: workspaceMode } = useWorkspaceMode();
  const mode =
    user?.onboardingStatus !== "workspace_active" ? "test" : workspaceMode;
  const { data, isLoading, error, reload } = useResource(
    async ({ token }) =>
      loadOnboardingState({
        token,
        environment: mode,
      }),
    [mode]
  );
  const {
    data: marketCatalog,
    isLoading: isMarketCatalogLoading,
    error: marketCatalogError,
  } = useResource(
    ({ token, merchantId }) =>
      loadCollectionMarketCatalog({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [businessDraft, setBusinessDraft] = useState<OnboardingState["business"] | null>(
    null
  );
  const [payoutWallet, setPayoutWallet] = useState("");
  const [payoutTrustline, setPayoutTrustline] =
    useState<StellarUsdcTrustlineStatus | null>(null);
  const [isCheckingPayoutWallet, setIsCheckingPayoutWallet] = useState(false);

  useEffect(() => {
    if (!data) {
      return;
    }

    setBusinessDraft(data.business);
    setPayoutWallet(data.payout.payoutWallet);
  }, [data]);

  useEffect(() => {
    const address = payoutWallet.trim();

    if (!address) {
      setPayoutTrustline(null);
      setIsCheckingPayoutWallet(false);
      return;
    }

    let isCurrent = true;

    setIsCheckingPayoutWallet(true);
    void checkStellarUsdcTrustline(mode, address)
      .then((status) => {
        if (isCurrent) {
          setPayoutTrustline(status);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setPayoutTrustline(null);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsCheckingPayoutWallet(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [mode, payoutWallet]);

  useEffect(() => {
    if (!actionError) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActionError(null);
    }, 4200);

    return () => window.clearTimeout(timeout);
  }, [actionError]);

  async function runAction(actionKey: string, runner: () => Promise<void>) {
    setBusyAction(actionKey);
    setActionError(null);

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

  async function connectSettlementWallet() {
    setBusyAction("settlement-connect");
    setActionError(null);

    try {
      const address = await connectStellarWallet(mode);
      const status = await checkStellarUsdcTrustline(mode, address);

      setPayoutWallet(address);
      setPayoutTrustline(status);
    } catch (connectError) {
      setActionError(toErrorMessage(connectError));
    } finally {
      setBusyAction(null);
    }
  }

  async function enableSettlementUsdc() {
    setBusyAction("settlement-enable");
    setActionError(null);

    try {
      await enableStellarUsdcTrustline(mode, payoutWallet);
      const status = await checkStellarUsdcTrustline(mode, payoutWallet);
      setPayoutTrustline(status);
    } catch (enableError) {
      setActionError(toErrorMessage(enableError));
    } finally {
      setBusyAction(null);
    }
  }

  return {
    token,
    user,
    mode,
    data,
    isLoading,
    error,
    reload,
    busyAction,
    actionError,
    marketCatalog,
    isMarketCatalogLoading,
    marketCatalogError,
    businessDraft,
    setBusinessDraft,
    payoutWallet,
    payoutTrustline,
    isCheckingPayoutWallet,
    connectSettlementWallet,
    enableSettlementUsdc,
    runAction,
  };
}

function StepIndicator({
  steps,
  activeIndex,
  onStepClick,
}: {
  steps: OnboardingState["steps"];
  activeIndex: number;
  onStepClick: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, index) => {
        const isComplete = step.status === "complete";
        const isActive = index === activeIndex;

        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onStepClick(index)}
            className="flex items-center gap-2"
          >
            <span
              className={
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors " +
                (isComplete
                  ? "bg-[color:var(--ink)] text-white"
                  : isActive
                    ? "border-2 border-[color:var(--ink)] text-[color:var(--ink)]"
                    : "border border-[color:var(--line)] text-[color:var(--muted)]")
              }
            >
              {isComplete ? (
                <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                  <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            {index < steps.length - 1 && (
              <span
                className={
                  "hidden h-px w-6 sm:block " +
                  (isComplete ? "bg-[color:var(--ink)]" : "bg-[color:var(--line)]")
                }
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function BusinessStep({
  token,
  businessDraft,
  setBusinessDraft,
  marketOptions,
  isMarketCatalogLoading,
  marketCatalogError,
  busyAction,
  onSave,
}: {
  token: string;
  businessDraft: OnboardingState["business"];
  setBusinessDraft: (updater: (current: OnboardingState["business"] | null) => OnboardingState["business"] | null) => void;
  marketOptions: Awaited<ReturnType<typeof loadCollectionMarketCatalog>>["markets"];
  isMarketCatalogLoading: boolean;
  marketCatalogError: string | null;
  busyAction: string | null;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-[color:var(--ink)]">Your name</span>
        <Input
          value={businessDraft.ownerName}
          onChange={(event) =>
            setBusinessDraft((current) =>
              current ? { ...current, ownerName: event.target.value } : current
            )
          }
          placeholder="Full name"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-[color:var(--ink)]">Business name</span>
        <Input
          value={businessDraft.name}
          onChange={(event) =>
            setBusinessDraft((current) =>
              current ? { ...current, name: event.target.value } : current
            )
          }
          placeholder="Your company"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-[color:var(--ink)]">Email</span>
        <Input
          type="email"
          value={businessDraft.supportEmail}
          onChange={(event) =>
            setBusinessDraft((current) =>
              current ? { ...current, supportEmail: event.target.value } : current
            )
          }
          placeholder="support@company.com"
        />
      </label>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-[color:var(--ink)]">Brand logo</span>
        <ImageUpload
          token={token}
          value={businessDraft.logoUrl || null}
          alt={`${businessDraft.name || "Renew"} logo`}
          onChange={(nextValue) =>
            setBusinessDraft((current) =>
              current ? { ...current, logoUrl: nextValue ?? "" } : current
            )
          }
          disabled={busyAction === "business"}
        />
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-[color:var(--ink)]">Supported markets</span>
        <MarketMultiSelect
          options={marketOptions}
          value={businessDraft.supportedMarkets}
          onChange={(supportedMarkets) =>
            setBusinessDraft((current) =>
              current ? { ...current, supportedMarkets } : current
            )
          }
          allLabel="All available markets"
          allOptionLabel="Select all"
          placeholder={
            marketOptions.length > 0
              ? "Select supported markets"
              : "No supported markets available"
          }
          disabled={busyAction === "business" || isMarketCatalogLoading || marketOptions.length === 0}
        />
        {isMarketCatalogLoading ? <InlineLoading label="Preparing markets" /> : null}
        {marketCatalogError ? (
          <p className="text-sm text-[#9b3d31]">{marketCatalogError}</p>
        ) : null}
      </div>
      <Button
        type="button"
        tone="brand"
        className={`mt-2 w-full ${ONBOARDING_PRIMARY_BUTTON_CLASS}`}
        disabled={busyAction === "business"}
        onClick={onSave}
      >
        {busyAction === "business" ? "Saving..." : "Save and continue"}
      </Button>
    </div>
  );
}

function VerificationStep({
  data,
  busyAction,
  onStartKyc,
  onRefresh,
}: {
  data: OnboardingState;
  busyAction: string | null;
  onStartKyc: () => void;
  onRefresh: () => void;
}) {
  const ownerKycApproved = data.verification.ownerKyc.status === "approved";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/4">
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-[color:var(--ink)]">
              <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.7" />
              <path d="M4.5 16C5.3 13.2 7.4 11.5 10 11.5C12.6 11.5 14.7 13.2 15.5 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-[color:var(--ink)]">Owner KYC</p>
            <Badge tone={toBadgeTone(data.verification.ownerKyc.status)}>
              {data.verification.ownerKyc.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>
        <Button
          type="button"
          tone={ownerKycApproved ? "neutral" : "brand"}
          className={ONBOARDING_PRIMARY_BUTTON_CLASS}
          disabled={busyAction === "owner-kyc" || ownerKycApproved}
          onClick={onStartKyc}
        >
          {busyAction === "owner-kyc" ? "Starting..." : ownerKycApproved ? "Verified" : "Start KYC"}
        </Button>
      </div>

      <button
        type="button"
        onClick={onRefresh}
        className="text-sm font-medium text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)]"
      >
        Refresh status
      </button>
    </div>
  );
}

function SettlementStep({
  payoutWallet,
  trustline,
  isCheckingWallet,
  busyAction,
  onConnect,
  onEnableUsdc,
  onSave,
}: {
  payoutWallet: string;
  trustline: StellarUsdcTrustlineStatus | null;
  isCheckingWallet: boolean;
  busyAction: string | null;
  onConnect: () => void;
  onEnableUsdc: () => void;
  onSave: () => void;
}) {
  const isConnecting = busyAction === "settlement-connect";
  const isEnabling = busyAction === "settlement-enable";
  const isSaving = busyAction === "settlement";
  const hasWallet = payoutWallet.trim().length > 0;
  const canEnableUsdc = hasWallet && trustline?.funded && !trustline.trusted;
  const canSave = hasWallet && Boolean(trustline?.trusted);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[color:var(--line)] bg-white px-4 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[color:var(--muted)]">
              Settlement wallet
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[color:var(--ink)]">
              {hasWallet ? formatAddress(payoutWallet) : "No wallet connected"}
            </p>
            {hasWallet ? (
              <div className="mt-2">
                <Badge tone={trustline?.trusted ? "brand" : "warning"}>
                  {isCheckingWallet
                    ? "Checking USDC"
                    : trustline?.trusted
                      ? "USDC enabled"
                      : trustline?.funded === false
                        ? "Needs XLM"
                        : "Enable USDC"}
                </Badge>
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            className="whitespace-nowrap"
            disabled={isConnecting || isEnabling || isSaving || isCheckingWallet}
            onClick={onConnect}
          >
            {isConnecting
              ? "Connecting..."
              : hasWallet
                ? "Change wallet"
                : "Connect wallet"}
          </Button>
        </div>

        {trustline?.funded === false ? (
          <p className="mt-3 text-sm font-medium text-[color:var(--muted)]">
            Fund the wallet with XLM before enabling USDC.
          </p>
        ) : null}

        {canEnableUsdc ? (
          <Button
            type="button"
            className="mt-4 w-full"
            disabled={isConnecting || isEnabling || isSaving || isCheckingWallet}
            onClick={onEnableUsdc}
          >
            {isEnabling ? "Enabling..." : "Enable USDC"}
          </Button>
        ) : null}
      </div>
      <Button
        type="button"
        tone="brand"
        className={`w-full ${ONBOARDING_PRIMARY_BUTTON_CLASS}`}
        disabled={!canSave || isConnecting || isEnabling || isSaving || isCheckingWallet}
        onClick={onSave}
      >
        {isSaving ? "Saving..." : "Save and continue"}
      </Button>
    </div>
  );
}

function RegisterStep({
  registerCard,
}: {
  registerCard: RegisterCardState;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
          Settlement wallet
        </p>
        <p className="mt-1.5 text-sm font-semibold text-[color:var(--ink)]">
          {registerCard.signerLabel}
        </p>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          {registerCard.signerNote}
        </p>
      </div>
      <Button
        type="button"
        tone="brand"
        className={`w-full ${ONBOARDING_PRIMARY_BUTTON_CLASS}`}
        disabled={registerCard.disabled}
        onClick={registerCard.onRegister}
      >
        {registerCard.label}
      </Button>
    </div>
  );
}

function OnboardingModal({
  state,
  registerCard,
}: {
  state: ReturnType<typeof useOnboardingWorkspace>;
  registerCard: RegisterCardState;
}) {
  const {
    token,
    mode,
    data,
    isLoading,
    error,
    reload,
    busyAction,
    actionError,
    marketCatalog,
    isMarketCatalogLoading,
    marketCatalogError,
    businessDraft,
    setBusinessDraft,
    payoutWallet,
    payoutTrustline,
    isCheckingPayoutWallet,
    connectSettlementWallet,
    enableSettlementUsdc,
    runAction,
  } = state;

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const isBootstrapping = !businessDraft || !data || !token;

  useEffect(() => {
    if (!data) return;
    const currentIndex = STEP_KEYS.indexOf(data.currentStepKey as typeof STEP_KEYS[number]);
    if (currentIndex >= 0) {
      setActiveStepIndex(currentIndex);
    }
  }, [data?.currentStepKey]);

  if (isBootstrapping) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0a]/40 backdrop-blur-sm">
        <LoadingState label="Preparing onboarding" className="min-h-[18rem] w-[min(100%,480px)] shadow-[0_40px_120px_rgba(0,0,0,0.12)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0a]/40 backdrop-blur-sm">
        <div className="w-[min(100%,480px)] rounded-[2rem] border border-[color:var(--line)] bg-white p-8 shadow-[0_40px_120px_rgba(0,0,0,0.12)]">
          <h2 className="font-display text-xl font-semibold tracking-[-0.04em] text-[color:var(--ink)]">
            Unable to load
          </h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">{error}</p>
          <Button
            type="button"
            tone="brand"
            className={`mt-5 ${ONBOARDING_PRIMARY_BUTTON_CLASS}`}
            onClick={() => void reload()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const activeStepKey = STEP_KEYS[activeStepIndex];
  const meta = STEP_META[activeStepKey];

  function goNext() {
    setActiveStepIndex((current) => Math.min(current + 1, STEP_KEYS.length - 1));
  }

  function goBack() {
    setActiveStepIndex((current) => Math.max(current - 1, 0));
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0a]/40 p-4 backdrop-blur-sm">
        <div className="flex max-h-[min(92vh,720px)] w-[min(100%,480px)] flex-col rounded-[2rem] border border-[color:var(--line)] bg-white shadow-[0_40px_120px_rgba(0,0,0,0.12)]">
          <div className="shrink-0 border-b border-[color:var(--line)] px-6 pt-6 pb-5">
            <div className="flex items-center justify-between">
              <Badge tone="neutral">Onboarding</Badge>
              <StepIndicator
                steps={data.steps}
                activeIndex={activeStepIndex}
                onStepClick={setActiveStepIndex}
              />
            </div>
            {isLoading ? (
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Syncing your workspace...
              </p>
            ) : null}
            <h2 className="mt-4 font-display text-xl font-semibold tracking-[-0.04em] text-[color:var(--ink)]">
              {meta.title}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {meta.subtitle}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {actionError && (
              <div className="mb-4 rounded-xl border border-[#ecd0cc] bg-[#fff6f5] px-4 py-2.5 text-sm text-[#9b3d31]">
                {actionError}
              </div>
            )}

            {activeStepKey === "business" && (
              <BusinessStep
                token={token}
                businessDraft={businessDraft}
                setBusinessDraft={setBusinessDraft}
                marketOptions={marketCatalog?.markets ?? []}
                isMarketCatalogLoading={isMarketCatalogLoading}
                marketCatalogError={marketCatalogError}
                busyAction={busyAction}
                onSave={() =>
                  void runAction("business", async () => {
                    await saveOnboardingBusiness({
                      token,
                      environment: mode,
                      logoUrl: businessDraft.logoUrl,
                      ownerName: businessDraft.ownerName,
                      name: businessDraft.name,
                      supportEmail: businessDraft.supportEmail,
                      supportedMarkets: businessDraft.supportedMarkets,
                    });
                    goNext();
                  })
                }
              />
            )}

            {activeStepKey === "verification" && (
              <VerificationStep
                data={data}
                busyAction={busyAction}
                onStartKyc={() =>
                  void runAction("owner-kyc", async () => {
                    const result = await startOnboardingVerification({
                      token,
                      environment: mode,
                      subject: "owner_kyc",
                    });
                    const verificationUrl = result.verificationUrl?.trim();

                    if (!verificationUrl) {
                      throw new Error("Verification did not return a link.");
                    }

                    window.location.assign(verificationUrl);
                  })
                }
                onRefresh={() => void reload()}
              />
            )}

            {activeStepKey === "payout" && (
              <SettlementStep
                payoutWallet={payoutWallet}
                trustline={payoutTrustline}
                isCheckingWallet={isCheckingPayoutWallet}
                busyAction={busyAction}
                onConnect={() => void connectSettlementWallet()}
                onEnableUsdc={() => void enableSettlementUsdc()}
                onSave={() =>
                  void runAction("settlement", async () => {
                    await saveOnboardingPayout({
                      token,
                      environment: mode,
                      payoutWallet,
                    });
                    goNext();
                  })
                }
              />
            )}

            {activeStepKey === "register" && (
              <RegisterStep registerCard={registerCard} />
            )}
          </div>

          <div className="shrink-0 border-t border-[color:var(--line)] px-6 py-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                className={
                  "text-sm font-medium transition-colors " +
                  (activeStepIndex === 0
                    ? "cursor-default text-transparent"
                    : "text-[color:var(--muted)] hover:text-[color:var(--ink)]")
                }
                disabled={activeStepIndex === 0}
              >
                Back
              </button>
              <div className="flex items-center gap-1.5">
                {STEP_KEYS.map((_, index) => (
                  <span
                    key={index}
                    className={
                      "h-1.5 rounded-full transition-all " +
                      (index === activeStepIndex
                        ? "w-4 bg-[color:var(--ink)]"
                        : "w-1.5 bg-[color:var(--line)]")
                    }
                  />
                ))}
              </div>
              {activeStepKey !== "register" ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="text-sm font-medium text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)]"
                >
                  Skip
                </button>
              ) : (
                <span className="text-sm text-transparent">Skip</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function OnboardingSurface() {
  const state = useOnboardingWorkspace();
  const { token, user, mode, busyAction, data, runAction } = state;

  const registerCard: RegisterCardState = {
    label:
      busyAction === "register"
        ? "Registering..."
        : "Register merchant",
    disabled:
      !data?.canComplete ||
      busyAction === "register" ||
      user?.role !== "owner",
    signerLabel: formatAddress(data?.payout.payoutWallet ?? null),
    signerNote: "This settlement wallet receives Stellar USDC.",
    onRegister: () =>
      void runAction("register", async () => {
        if (!token || !user) {
          throw new Error("Dashboard session is missing.");
        }

        if (user.role !== "owner") {
          throw new Error("Only the workspace owner can register the merchant.");
        }
        await registerOnboardingMerchant({
          token,
          environment: mode,
        });
      }),
  };

  return <OnboardingModal state={state} registerCard={registerCard} />;
}

export default function OnboardingPage() {
  return <OnboardingSurface />;
}
