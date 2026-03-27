"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  getAccessToken,
  getIdentityToken,
  usePrivy,
} from "@privy-io/react-auth";
import {
  useCreateWallet as useCreateSolanaWallet,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";

import { accessTokenStorageKey, ApiError } from "@/lib/api";
import { exchangePrivySession } from "@/lib/auth";

function extractPrivyEmail(user: unknown) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const directEmail =
    "email" in user &&
    typeof user.email === "object" &&
    user.email !== null &&
    "address" in user.email &&
    typeof user.email.address === "string"
      ? user.email.address.trim().toLowerCase()
      : null;

  if (directEmail) {
    return directEmail;
  }

  const linkedAccounts =
    "linkedAccounts" in user && Array.isArray(user.linkedAccounts)
      ? user.linkedAccounts
      : "linked_accounts" in user && Array.isArray(user.linked_accounts)
        ? user.linked_accounts
        : [];
  const emailAccount = linkedAccounts.find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      "type" in entry &&
      typeof entry.type === "string" &&
      entry.type.toLowerCase() === "email" &&
      "address" in entry &&
      typeof entry.address === "string"
  ) as { address?: string } | undefined;

  return emailAccount?.address?.trim().toLowerCase() ?? null;
}

function extractEmbeddedWalletAddress(wallets: Array<{
  address: string;
  chainType?: string;
  type?: string;
  walletClientType?: string;
}>) {
  const wallet = wallets.find((entry) => {
    const walletType = entry.chainType ?? entry.type ?? "solana";
    return entry.walletClientType === "privy" && walletType === "solana";
  });

  return wallet?.address?.trim() ?? null;
}

function formatAddress(value: string | null) {
  if (!value) {
    return "Provisioning";
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

  return "Unable to continue with Privy.";
}

type PrivySessionCardProps = {
  mode: "login" | "signup";
  nextPath: string;
};

export function PrivySessionCard({ mode, nextPath }: PrivySessionCardProps) {
  const router = useRouter();
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { createWallet } = useCreateSolanaWallet();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shouldExchange, setShouldExchange] = useState(false);
  const [isProvisioningWallet, setIsProvisioningWallet] = useState(false);
  const [walletBootstrapAttempted, setWalletBootstrapAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const embeddedWalletAddress = useMemo(() => extractEmbeddedWalletAddress(wallets), [wallets]);
  const operatorWalletAddress = embeddedWalletAddress;

  async function finishExchange() {
    setIsSubmitting(true);
    setError(null);

    try {
      const authToken = await getAccessToken();
      const identityToken = await getIdentityToken();

      if (!authToken) {
        throw new Error("Privy did not return an access token.");
      }

      const session = await exchangePrivySession({
        authToken,
        identityToken,
        name: mode === "signup" ? name.trim() : undefined,
        company: mode === "signup" ? company.trim() : undefined,
        email: extractPrivyEmail(user) ?? undefined,
        operatorWalletAddress: operatorWalletAddress ?? undefined,
      });

      window.localStorage.setItem(accessTokenStorageKey, session.accessToken);
      router.replace(nextPath);
    } catch (exchangeError) {
      setError(toErrorMessage(exchangeError));
      setShouldExchange(false);
      await logout?.();
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!ready || !authenticated) {
      setWalletBootstrapAttempted(false);
      return;
    }

    if (embeddedWalletAddress || isProvisioningWallet || walletBootstrapAttempted) {
      return;
    }

    let cancelled = false;
    setWalletBootstrapAttempted(true);
    setIsProvisioningWallet(true);
    setError(null);

    void createWallet()
      .catch((walletError) => {
        if (cancelled) {
          return;
        }

        setWalletBootstrapAttempted(false);
        setShouldExchange(false);
        setError(toErrorMessage(walletError));
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
    embeddedWalletAddress,
    isProvisioningWallet,
    ready,
    walletBootstrapAttempted,
  ]);

  useEffect(() => {
    if (
      !authenticated ||
      !shouldExchange ||
      isSubmitting ||
      isProvisioningWallet ||
      !operatorWalletAddress
    ) {
      return;
    }

    void finishExchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    operatorWalletAddress,
    shouldExchange,
    isProvisioningWallet,
    isSubmitting,
  ]);

  if (!appId) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-[2rem] border border-[#d3e4cf] bg-[radial-gradient(circle_at_top_left,_rgba(217,246,188,0.82),_rgba(244,247,241,0.96)_56%,_rgba(255,255,255,0.98)_100%)] p-6 shadow-[0_24px_80px_rgba(12,74,39,0.08)]">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand)]">
          Passkey first
        </p>
        <h2 className="font-display text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
          {mode === "signup" ? "Create a walletless workspace." : "Continue with Privy."}
        </h2>
        <p className="text-sm leading-7 text-[color:var(--muted)]">
          Use passkey or email in Privy. Renew will exchange that session for your platform token
          and route you into onboarding after provisioning your Solana operator wallet.
        </p>
      </div>

      {authenticated ? (
        <div className="rounded-[1.15rem] border border-[color:var(--line)] bg-white/82 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Operator wallet
          </p>
          <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
            {embeddedWalletAddress
              ? `Operator wallet ${formatAddress(embeddedWalletAddress)}`
              : "Provisioning operator wallet"}
          </p>
          <p className="mt-1 text-xs leading-6 text-[color:var(--muted)]">
            Privy provisions the embedded Solana wallet first, then Renew binds that wallet as the
            operator authority for the workspace.
          </p>
        </div>
      ) : null}

      {mode === "signup" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[color:var(--ink)]">Full name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-12 rounded-[1.15rem] border border-[color:var(--line)] bg-white px-4 text-[color:var(--ink)] outline-none transition-colors focus:border-[color:var(--brand)]"
              placeholder="Jane Doe"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[color:var(--ink)]">Company</span>
            <input
              type="text"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              className="h-12 rounded-[1.15rem] border border-[color:var(--line)] bg-white px-4 text-[color:var(--ink)] outline-none transition-colors focus:border-[color:var(--brand)]"
              placeholder="Acme Inc."
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[1.15rem] border border-[#e7c3bc] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b3b2d]">
          {error}
          {mode === "login" ? (
            <>
              {" "}
              <Link href="/signup" className="font-semibold underline">
                Create a workspace instead.
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        disabled={
          !ready ||
          isSubmitting ||
          isProvisioningWallet ||
          (mode === "signup" && (!name.trim() || !company.trim()))
        }
        onClick={async () => {
          setShouldExchange(true);
          setError(null);

          if (authenticated) {
            if (!operatorWalletAddress) {
              setWalletBootstrapAttempted(false);
              return;
            }

            await finishExchange();
            return;
          }

          setIsSubmitting(true);
          try {
            await login();
          } catch (loginError) {
            setError(toErrorMessage(loginError));
            setShouldExchange(false);
          } finally {
            setIsSubmitting(false);
          }
        }}
        className="inline-flex h-12 items-center justify-center rounded-full bg-[#0c4a27] px-6 text-sm font-semibold text-[#d9f6bc] transition-colors hover:bg-[#093a1e] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isProvisioningWallet
          ? "Provisioning wallet..."
          : isSubmitting
            ? "Opening Privy..."
          : mode === "signup"
            ? "Create workspace with passkey"
            : "Sign in with passkey"}
      </button>
    </div>
  );
}
