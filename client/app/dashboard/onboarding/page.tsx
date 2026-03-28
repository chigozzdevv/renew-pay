"use client";

import { useEffect, useMemo, useState } from "react";

import { usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet as useCreateSolanaWallet,
  useSignMessage,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useResource } from "@/components/dashboard/use-resource";
import { Badge, Button, Card, Input, PageState } from "@/components/dashboard/ui";
import { ApiError } from "@/lib/api";
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
  const { mode } = useWorkspaceMode();
  const { data, isLoading, error, reload } = useResource(
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
    businessDraft,
    setBusinessDraft,
    payoutWallet,
    setPayoutWallet,
    runAction,
  };
}

function OnboardingContent(input: {
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
    businessDraft,
    setBusinessDraft,
    payoutWallet,
    setPayoutWallet,
    runAction,
  } = input.state;

  if (isLoading || !businessDraft || !data || !token) {
    return (
      <PageState
        title="Preparing onboarding"
        message="Loading your workspace setup."
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
            <Badge tone="brand">{mode === "live" ? "Live" : "Test"}</Badge>
            {data.steps.map((step) => (
              <Badge key={step.key} tone={toBadgeTone(step.status)}>
                {step.label}
              </Badge>
            ))}
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-semibold tracking-[-0.06em] text-[color:var(--ink)] sm:text-[2.6rem]">
              Finish merchant setup.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-[color:var(--muted)]">
              Add your business details, clear verification, set payouts, then register.
            </p>
          </div>
        </div>
      </div>

      {actionMessage ? <PageState title="Updated" message={actionMessage} /> : null}
      {actionError ? (
        <PageState title="Action failed" message={actionError} tone="danger" />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Business basics" description="Logo, name, email, and markets.">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Logo URL</span>
              <Input
                type="url"
                value={businessDraft.logoUrl}
                onChange={(event) =>
                  setBusinessDraft((current) =>
                    current ? { ...current, logoUrl: event.target.value } : current
                  )
                }
                placeholder="https://..."
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Business name</span>
              <Input
                value={businessDraft.name}
                onChange={(event) =>
                  setBusinessDraft((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Email</span>
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
                  await saveOnboardingBusiness({
                    token,
                    environment: mode,
                    logoUrl: businessDraft.logoUrl,
                    name: businessDraft.name,
                    supportEmail: businessDraft.supportEmail,
                    supportedMarkets: businessDraft.supportedMarkets,
                  });
                  return "Business basics saved.";
                })
              }
            >
              {busyAction === "business" ? "Saving..." : "Save basics"}
            </Button>
          </div>
        </Card>

        <Card
          title="Verification"
          description={mode === "live" ? "KYC first, then KYB." : "KYC first."}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[color:var(--ink)]">Owner KYC</p>
                <Badge tone={toBadgeTone(data.verification.ownerKyc.status)}>
                  {data.verification.ownerKyc.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <Button
                type="button"
                disabled={busyAction === "owner-kyc"}
                onClick={() =>
                  void runAction("owner-kyc", async () => {
                    await startOnboardingVerification({
                      token,
                      environment: mode,
                      subject: "owner_kyc",
                    });
                    return "Owner KYC started.";
                  })
                }
              >
                {busyAction === "owner-kyc" ? "Starting..." : "Start KYC"}
              </Button>
            </div>

            {mode === "live" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Merchant KYB</p>
                  <Badge tone={toBadgeTone(data.verification.merchantKyb.status)}>
                    {data.verification.merchantKyb.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <Button
                  type="button"
                  disabled={busyAction === "merchant-kyb"}
                  onClick={() =>
                    void runAction("merchant-kyb", async () => {
                      await startOnboardingVerification({
                        token,
                        environment: mode,
                        subject: "merchant_kyb",
                      });
                      return "Merchant KYB started.";
                    })
                  }
                >
                  {busyAction === "merchant-kyb" ? "Starting..." : "Start KYB"}
                </Button>
              </div>
            ) : null}

            <Button type="button" onClick={() => void reload()}>
              Refresh status
            </Button>
          </div>
        </Card>

        <Card title="Payout" description="Wallet first. Bank transfer is coming soon.">
          <div className="space-y-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--ink)]">Payout wallet</span>
              <Input
                value={payoutWallet}
                onChange={(event) => setPayoutWallet(event.target.value)}
                placeholder="Enter Solana wallet"
              />
            </label>
            <div className="rounded-2xl border border-[color:var(--line)] bg-[#f8faf7] px-4 py-3 text-sm text-[color:var(--muted)]">
              Bank transfer payout is coming soon.
            </div>
            <Button
              type="button"
              tone="brand"
              disabled={busyAction === "payout"}
              onClick={() =>
                void runAction("payout", async () => {
                  await saveOnboardingPayout({
                    token,
                    environment: mode,
                    payoutWallet,
                  });
                  return "Payout wallet saved.";
                })
              }
            >
              {busyAction === "payout" ? "Saving..." : "Save payout"}
            </Button>
          </div>
        </Card>

        <Card
          title="Register"
          description="Verify your Privy signer, initialize approvals, and register the merchant."
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Privy signer
              </p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                {input.registerCard.signerLabel}
              </p>
              <p className="mt-1 text-xs text-[color:var(--muted)]">
                {input.registerCard.signerNote}
              </p>
            </div>
            <Button
              type="button"
              tone="brand"
              disabled={input.registerCard.disabled}
              onClick={input.registerCard.onRegister}
            >
              {input.registerCard.label}
            </Button>
          </div>
        </Card>
      </div>
    </section>
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
      .catch((walletError) => {
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

  return <OnboardingContent state={state} registerCard={registerCard} />;
}

function FallbackOnboardingSurface() {
  const state = useOnboardingWorkspace();

  return (
    <OnboardingContent
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
