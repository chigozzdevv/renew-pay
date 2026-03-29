"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet as useCreateSolanaWallet,
  useSignMessage,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { MarketMultiSelect } from "@/components/dashboard/market-controls";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useResource } from "@/components/dashboard/use-resource";
import { Badge, Button, Input } from "@/components/dashboard/ui";
import { ImageUpload } from "@/components/shared/image-upload";
import { ApiError } from "@/lib/api";
import { loadBillingMarketCatalog } from "@/lib/markets";
import {
  registerOnboardingMerchant,
  loadOnboardingState,
  saveOnboardingBusiness,
  saveOnboardingPayout,
  startOnboardingVerification,
  type OnboardingState,
} from "@/lib/onboarding";
import {
  createTreasurySignerChallenge,
  verifyTreasurySigner,
} from "@/lib/treasury";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
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
    title: "Payout",
    subtitle: "Set up where you want to receive your funds.",
  },
  register: {
    title: "Register",
    subtitle: "Finalize your merchant registration.",
  },
};

type PrivyWalletRecord = {
  address: string;
  walletClientType?: string;
  chainType?: string;
  type?: string;
};

type RegisterCardState = {
  label: string;
  disabled: boolean;
  signerLabel: string;
  signerNote: string;
  onRegister?: () => void;
};

type VerificationSubject = "owner_kyc" | "merchant_kyb";

type SumsubLaunchState = {
  subject: VerificationSubject;
  accessToken: string;
  title: string;
};

type SumsubSdkInstance = {
  launch(target: string | HTMLElement): void;
  destroy?: () => void;
};

type SumsubSdkChain = {
  withConf(config: Record<string, unknown>): SumsubSdkChain;
  withOptions(options: Record<string, unknown>): SumsubSdkChain;
  on(event: string, handler: (payload: unknown) => void): SumsubSdkChain;
  onMessage(handler: (type: string, payload: unknown) => void): SumsubSdkChain;
  build(): SumsubSdkInstance;
};

type SumsubSdkBuilder = {
  init(accessToken: string, refreshAccessToken: () => Promise<string>): SumsubSdkChain;
};

declare global {
  interface Window {
    snsWebSdk?: SumsubSdkBuilder;
  }
}

let sumsubScriptPromise: Promise<SumsubSdkBuilder> | null = null;

function loadSumsubWebSdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Sumsub WebSDK can only load in the browser."));
  }

  if (window.snsWebSdk) {
    return Promise.resolve(window.snsWebSdk);
  }

  if (sumsubScriptPromise) {
    return sumsubScriptPromise;
  }

  sumsubScriptPromise = new Promise<SumsubSdkBuilder>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-sumsub-websdk="true"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.snsWebSdk) {
          resolve(window.snsWebSdk);
          return;
        }

        reject(new Error("Sumsub WebSDK did not initialize correctly."));
      });
      existingScript.addEventListener("error", () => {
        reject(new Error("Failed to load Sumsub WebSDK."));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";
    script.async = true;
    script.dataset.sumsubWebsdk = "true";
    script.onload = () => {
      if (window.snsWebSdk) {
        resolve(window.snsWebSdk);
        return;
      }

      sumsubScriptPromise = null;
      reject(new Error("Sumsub WebSDK did not initialize correctly."));
    };
    script.onerror = () => {
      sumsubScriptPromise = null;
      reject(new Error("Failed to load Sumsub WebSDK."));
    };
    document.head.appendChild(script);
  });

  return sumsubScriptPromise;
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

function toBadgeTone(status: string) {
  if (status === "approved" || status === "complete") {
    return "brand" as const;
  }

  if (status === "current" || status === "pending") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function findEmbeddedWallet<T extends PrivyWalletRecord>(wallets: T[]) {
  return (
    wallets.find((entry) => {
      const walletType = entry.chainType ?? entry.type ?? "solana";
      return entry.walletClientType === "privy" && walletType === "solana";
    }) ?? null
  );
}

function encodeBase58(bytes: Uint8Array) {
  if (bytes.length === 0) {
    return "";
  }

  const digits = [0];

  for (const value of bytes) {
    let carry = value;

    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] * 256;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }

    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let encoded = "";

  for (const value of bytes) {
    if (value !== 0) {
      break;
    }

    encoded += BASE58_ALPHABET[0];
  }

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    encoded += BASE58_ALPHABET[digits[index]];
  }

  return encoded;
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
      loadBillingMarketCatalog({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [businessDraft, setBusinessDraft] = useState<OnboardingState["business"] | null>(
    null
  );
  const [payoutWallet, setPayoutWallet] = useState("");

  useEffect(() => {
    if (!data) {
      return;
    }

    setBusinessDraft(data.business);
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

  async function runAction(
    actionKey: string,
    runner: () => Promise<string | void>
  ) {
    setBusyAction(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      const message = await runner();
      await reload();
      await refreshSession();
      if (message) {
        setActionMessage(message);
      }
    } catch (mutationError) {
      setActionError(toErrorMessage(mutationError));
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
    actionMessage,
    actionError,
    marketCatalog,
    isMarketCatalogLoading,
    marketCatalogError,
    businessDraft,
    setBusinessDraft,
    payoutWallet,
    setPayoutWallet,
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
  marketOptions: Awaited<ReturnType<typeof loadBillingMarketCatalog>>["markets"];
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
            isMarketCatalogLoading
              ? "Loading supported markets..."
              : marketOptions.length > 0
                ? "Select supported markets"
                : "No supported markets available"
          }
          disabled={busyAction === "business" || isMarketCatalogLoading || marketOptions.length === 0}
        />
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
  mode,
  busyAction,
  onStartKyc,
  onStartKyb,
  onRefresh,
}: {
  data: OnboardingState;
  mode: "test" | "live";
  busyAction: string | null;
  onStartKyc: () => void;
  onStartKyb: () => void;
  onRefresh: () => void;
}) {
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
          tone="brand"
          className={ONBOARDING_PRIMARY_BUTTON_CLASS}
          disabled={busyAction === "owner-kyc"}
          onClick={onStartKyc}
        >
          {busyAction === "owner-kyc" ? "Starting..." : "Start KYC"}
        </Button>
      </div>

      {mode === "live" ? (
        <div className="flex items-center justify-between rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/4">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-[color:var(--ink)]">
                <rect x="4" y="4" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
                <path d="M7 9.5L9 11.5L13 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-[color:var(--ink)]">Merchant KYB</p>
              <Badge tone={toBadgeTone(data.verification.merchantKyb.status)}>
                {data.verification.merchantKyb.status.replace(/_/g, " ")}
              </Badge>
            </div>
          </div>
          <Button
            type="button"
            tone="brand"
            className={ONBOARDING_PRIMARY_BUTTON_CLASS}
            disabled={busyAction === "merchant-kyb"}
            onClick={onStartKyb}
          >
            {busyAction === "merchant-kyb" ? "Starting..." : "Start KYB"}
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-[color:var(--line)] bg-[#f8faf7] px-4 py-3 text-sm text-[color:var(--muted)]">
          KYB is only required in live mode.
        </div>
      )}

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

function PayoutStep({
  payoutWallet,
  setPayoutWallet,
  busyAction,
  onSave,
}: {
  payoutWallet: string;
  setPayoutWallet: (value: string) => void;
  busyAction: string | null;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-[color:var(--ink)]">Payout wallet</span>
        <Input
          value={payoutWallet}
          onChange={(event) => setPayoutWallet(event.target.value)}
          placeholder="Solana wallet address"
        />
      </label>
      <div className="rounded-2xl border border-[color:var(--line)] bg-[#f8faf7] px-4 py-3 text-sm text-[color:var(--muted)]">
        Bank transfer payout is coming soon.
      </div>
      <Button
        type="button"
        tone="brand"
        className={`w-full ${ONBOARDING_PRIMARY_BUTTON_CLASS}`}
        disabled={busyAction === "payout"}
        onClick={onSave}
      >
        {busyAction === "payout" ? "Saving..." : "Save and continue"}
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
          Privy signer
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
    actionMessage,
    actionError,
    marketCatalog,
    isMarketCatalogLoading,
    marketCatalogError,
    businessDraft,
    setBusinessDraft,
    payoutWallet,
    setPayoutWallet,
    runAction,
  } = state;

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [sumsubLaunch, setSumsubLaunch] = useState<SumsubLaunchState | null>(null);
  const [sumsubError, setSumsubError] = useState<string | null>(null);
  const sumsubContainerRef = useRef<HTMLDivElement | null>(null);
  const sumsubInstanceRef = useRef<{ destroy?: () => void } | null>(null);

  useEffect(() => {
    if (!data) return;
    const currentIndex = STEP_KEYS.indexOf(data.currentStepKey as typeof STEP_KEYS[number]);
    if (currentIndex >= 0) {
      setActiveStepIndex(currentIndex);
    }
  }, [data?.currentStepKey]);

  async function refreshSumsubAccessToken(subject: VerificationSubject) {
    if (!token) {
      throw new Error("Dashboard session is missing.");
    }

    const nextSession = await startOnboardingVerification({
      token,
      environment: mode,
      subject,
    });
    const nextToken = nextSession.sdkAccessToken?.trim();

    if (!nextToken) {
      throw new Error("Sumsub did not return a WebSDK access token.");
    }

    return nextToken;
  }

  useEffect(() => {
    if (!sumsubLaunch) {
      if (sumsubInstanceRef.current?.destroy) {
        sumsubInstanceRef.current.destroy();
      }
      sumsubInstanceRef.current = null;
      if (sumsubContainerRef.current) {
        sumsubContainerRef.current.innerHTML = "";
      }
      return;
    }

    let cancelled = false;
    setSumsubError(null);

    void loadSumsubWebSdk()
      .then((sdk) => {
        if (cancelled || !sumsubContainerRef.current) {
          return;
        }

        sumsubContainerRef.current.innerHTML = "";

        const builder = sdk
          .init(sumsubLaunch.accessToken, () => refreshSumsubAccessToken(sumsubLaunch.subject))
          .withConf({
            lang: "en",
            theme: "light",
          });

        const instance = builder
          .withOptions({
            addViewportTag: false,
            adaptIframeHeight: true,
          })
          .on("idCheck.onApplicantSubmitted", () => {
            void reload();
            setSumsubLaunch(null);
          })
          .on("idCheck.onApplicantVerificationCompleted", () => {
            void reload();
            setSumsubLaunch(null);
          })
          .on("idCheck.onApplicantStatusChanged", () => {
            void reload();
          })
          .on("idCheck.onError", (sdkError) => {
            const code =
              typeof sdkError === "object" &&
              sdkError !== null &&
              "error" in sdkError &&
              typeof sdkError.error === "string"
                ? sdkError.error
                : "Verification could not continue.";
            setSumsubError(code);
          })
          .onMessage((type, payload) => {
            if (
              type === "idCheck.onApplicantSubmitted" ||
              type === "idCheck.onApplicantVerificationCompleted"
            ) {
              void reload();
              setSumsubLaunch(null);
              return;
            }

            if (type === "idCheck.onError") {
              const message =
                typeof payload === "object" &&
                payload !== null &&
                "error" in payload &&
                typeof payload.error === "string"
                  ? payload.error
                  : "Verification could not continue.";
              setSumsubError(message);
            }
          })
          .build();

        sumsubInstanceRef.current = instance;
        instance.launch(sumsubContainerRef.current);
      })
      .catch((launchError) => {
        if (cancelled) {
          return;
        }

        setSumsubError(toErrorMessage(launchError));
      });

    return () => {
      cancelled = true;
      if (sumsubInstanceRef.current?.destroy) {
        sumsubInstanceRef.current.destroy();
      }
      sumsubInstanceRef.current = null;
      if (sumsubContainerRef.current) {
        sumsubContainerRef.current.innerHTML = "";
      }
    };
  }, [mode, reload, sumsubLaunch, token]);

  if (isLoading || !businessDraft || !data || !token) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0a]/40 backdrop-blur-sm">
        <div className="w-[min(100%,480px)] rounded-[2rem] border border-[color:var(--line)] bg-white p-8 shadow-[0_40px_120px_rgba(0,0,0,0.12)]">
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--line)] border-t-[color:var(--ink)]" />
            <p className="text-sm text-[color:var(--muted)]">Loading setup...</p>
          </div>
        </div>
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
            <h2 className="mt-4 font-display text-xl font-semibold tracking-[-0.04em] text-[color:var(--ink)]">
              {meta.title}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {meta.subtitle}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {actionMessage && (
              <div className="mb-4 rounded-xl border border-[#c2ddb8] bg-[#f0f8ec] px-4 py-2.5 text-sm text-[#2d5a1e]">
                {actionMessage}
              </div>
            )}
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
                    return "Business basics saved.";
                  })
                }
              />
            )}

            {activeStepKey === "verification" && (
              <VerificationStep
                data={data}
                mode={mode}
                busyAction={busyAction}
                onStartKyc={() =>
                  void runAction("owner-kyc", async () => {
                    const result = await startOnboardingVerification({
                      token,
                      environment: mode,
                      subject: "owner_kyc",
                    });
                    const accessToken = result.sdkAccessToken?.trim();

                    if (!accessToken) {
                      throw new Error("Sumsub did not return a WebSDK access token.");
                    }

                    setSumsubLaunch({
                      subject: "owner_kyc",
                      accessToken,
                      title: "Owner KYC",
                    });
                    return "Owner KYC started.";
                  })
                }
                onStartKyb={() =>
                  void runAction("merchant-kyb", async () => {
                    const result = await startOnboardingVerification({
                      token,
                      environment: mode,
                      subject: "merchant_kyb",
                    });
                    const accessToken = result.sdkAccessToken?.trim();

                    if (!accessToken) {
                      throw new Error("Sumsub did not return a WebSDK access token.");
                    }

                    setSumsubLaunch({
                      subject: "merchant_kyb",
                      accessToken,
                      title: "Merchant KYB",
                    });
                    return "Merchant KYB started.";
                  })
                }
                onRefresh={() => void reload()}
              />
            )}

            {activeStepKey === "payout" && (
              <PayoutStep
                payoutWallet={payoutWallet}
                setPayoutWallet={setPayoutWallet}
                busyAction={busyAction}
                onSave={() =>
                  void runAction("payout", async () => {
                    await saveOnboardingPayout({
                      token,
                      environment: mode,
                      payoutWallet,
                    });
                    goNext();
                    return "Payout saved.";
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

      {sumsubLaunch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(6,12,8,0.58)] p-4">
          <div className="flex h-[min(92vh,860px)] w-[min(100%,1080px)] flex-col overflow-hidden rounded-[2rem] border border-[color:var(--line)] bg-white shadow-[0_40px_140px_rgba(4,12,8,0.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--line)] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                  Sumsub verification
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
                  {sumsubLaunch.title}
                </h2>
                <p className="mt-2 text-sm leading-7 text-[color:var(--muted)]">
                  Complete the verification flow here, then return to onboarding.
                </p>
              </div>
              <Button type="button" onClick={() => setSumsubLaunch(null)}>
                Close
              </Button>
            </div>

            {sumsubError && (
              <div className="border-b border-[#ecd0cc] bg-[#fff6f5] px-5 py-3 text-sm text-[#9b3d31]">
                {sumsubError}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto bg-[#f7faf6] p-4">
              <div
                ref={sumsubContainerRef}
                className="min-h-full rounded-[1.6rem] border border-[color:var(--line)] bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PrivyOnboardingSurface() {
  const state = useOnboardingWorkspace();
  const { token, user, mode, busyAction, data, runAction } = state;
  const { ready: privyReady, authenticated } = usePrivy();
  const { ready: solanaWalletsReady, wallets } = useSolanaWallets();
  const { createWallet } = useCreateSolanaWallet();
  const { signMessage } = useSignMessage();
  const [isProvisioningWallet, setIsProvisioningWallet] = useState(false);
  const [walletBootstrapAttempted, setWalletBootstrapAttempted] = useState(false);

  const embeddedWallet = useMemo(() => findEmbeddedWallet(wallets), [wallets]);
  const activeWalletAddress =
    embeddedWallet?.address?.trim() ?? user?.operatorWalletAddress?.trim() ?? null;

  useEffect(() => {
    if (!privyReady || !authenticated || !solanaWalletsReady) {
      setWalletBootstrapAttempted(false);
      return;
    }

    if (embeddedWallet || isProvisioningWallet || walletBootstrapAttempted) {
      return;
    }

    let cancelled = false;
    setWalletBootstrapAttempted(true);
    setIsProvisioningWallet(true);

    void createWallet()
      .catch(() => {
        if (cancelled) {
          return;
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsProvisioningWallet(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    authenticated,
    createWallet,
    embeddedWallet,
    isProvisioningWallet,
    privyReady,
    solanaWalletsReady,
    walletBootstrapAttempted,
  ]);

  const registerCard: RegisterCardState = {
    label:
      busyAction === "register"
        ? "Registering..."
        : isProvisioningWallet
          ? "Preparing wallet..."
          : "Register merchant",
    disabled:
      !data?.canComplete ||
      busyAction === "register" ||
      isProvisioningWallet ||
      !activeWalletAddress ||
      user?.role !== "owner",
    signerLabel: formatAddress(activeWalletAddress),
    signerNote: isProvisioningWallet
      ? "Provisioning your Solana wallet."
      : "This wallet becomes the initial owner signer for 1-of-1 approvals.",
    onRegister: () =>
      void runAction("register", async () => {
        if (!token || !user) {
          throw new Error("Dashboard session is missing.");
        }

        if (user.role !== "owner") {
          throw new Error("Only the workspace owner can register the merchant.");
        }

        if (!embeddedWallet) {
          throw new Error(
            isProvisioningWallet
              ? "Privy is still provisioning the Solana wallet."
              : "Your Privy Solana wallet is not ready yet."
          );
        }

        const challenge = await createTreasurySignerChallenge({
          token,
          merchantId: user.merchantId,
          walletAddress: embeddedWallet.address,
        });
        const signed = await signMessage({
          message: new TextEncoder().encode(challenge.challengeMessage),
          wallet: embeddedWallet,
        });

        await verifyTreasurySigner({
          token,
          merchantId: user.merchantId,
          signature: encodeBase58(signed.signature),
        });
        await registerOnboardingMerchant({
          token,
          environment: mode,
        });
        return "Merchant registered.";
      }),
  };

  return <OnboardingModal state={state} registerCard={registerCard} />;
}

function FallbackOnboardingSurface() {
  const state = useOnboardingWorkspace();

  return (
    <OnboardingModal
      state={state}
      registerCard={{
        label: "Register merchant",
        disabled: true,
        signerLabel: "Privy not configured",
        signerNote: "Add NEXT_PUBLIC_PRIVY_APP_ID to finish registration in this environment.",
      }}
    />
  );
}

export default function OnboardingPage() {
  if (!PRIVY_APP_ID) {
    return <FallbackOnboardingSurface />;
  }

  return <PrivyOnboardingSurface />;
}
