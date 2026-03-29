"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  getAccessToken,
  getIdentityToken,
  useLogin,
  usePrivy,
} from "@privy-io/react-auth";
import {
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";

import { accessTokenStorageKey, ApiError, readAccessToken } from "@/lib/api";
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

  for (const account of linkedAccounts) {
    if (!account || typeof account !== "object") {
      continue;
    }

    if ("email" in account && typeof account.email === "string" && account.email.trim()) {
      return account.email.trim().toLowerCase();
    }

    const accountType =
      "type" in account && typeof account.type === "string"
        ? account.type.trim().toLowerCase()
        : null;
    if (
      accountType === "email" &&
      "address" in account &&
      typeof account.address === "string" &&
      account.address.trim()
    ) {
      return account.address.trim().toLowerCase();
    }
  }

  return null;
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

function extractPrivyEmbeddedWalletAddress(user: unknown) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const linkedAccounts =
    "linkedAccounts" in user && Array.isArray(user.linkedAccounts)
      ? user.linkedAccounts
      : "linked_accounts" in user && Array.isArray(user.linked_accounts)
        ? user.linked_accounts
        : [];

  for (const account of linkedAccounts) {
    if (!account || typeof account !== "object") {
      continue;
    }

    const accountType =
      "type" in account && typeof account.type === "string"
        ? account.type.trim().toLowerCase()
        : null;
    const walletClientType =
      "walletClientType" in account && typeof account.walletClientType === "string"
        ? account.walletClientType.trim().toLowerCase()
        : "wallet_client_type" in account && typeof account.wallet_client_type === "string"
          ? account.wallet_client_type.trim().toLowerCase()
          : null;
    const chainType =
      "chainType" in account && typeof account.chainType === "string"
        ? account.chainType.trim().toLowerCase()
        : "chain_type" in account && typeof account.chain_type === "string"
          ? account.chain_type.trim().toLowerCase()
          : null;
    const address =
      "address" in account && typeof account.address === "string" && account.address.trim()
        ? account.address.trim()
        : null;

    if (
      accountType === "wallet" &&
      address &&
      chainType === "solana" &&
      (walletClientType === "privy" || walletClientType === "privy-v2")
    ) {
      return address;
    }
  }

  return null;
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
  nextPath: string;
};

export function PrivySessionCard({ nextPath }: PrivySessionCardProps) {
  const router = useRouter();
  const { ready, authenticated, user, logout } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shouldExchange, setShouldExchange] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldExchangeRef = useRef(false);
  const exchangeStartedRef = useRef(false);
  const autoResumeAttemptedRef = useRef(false);

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const embeddedWalletAddress = useMemo(() => extractEmbeddedWalletAddress(wallets), [wallets]);

  const isBusy = isSubmitting || shouldExchange;

  async function finishExchange(sourceUser?: unknown) {
    if (exchangeStartedRef.current) {
      return;
    }

    exchangeStartedRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const authToken = await getAccessToken();
      let identityToken: string | null = null;

      try {
        identityToken = await getIdentityToken();
      } catch {
        identityToken = null;
      }

      if (!authToken) {
        throw new Error("Privy did not return an access token.");
      }

      const operatorWalletAddress =
        extractPrivyEmbeddedWalletAddress(sourceUser ?? user) ?? embeddedWalletAddress;

      const session = await exchangePrivySession({
        authToken,
        identityToken,
        email: extractPrivyEmail(sourceUser ?? user) ?? undefined,
        operatorWalletAddress: operatorWalletAddress ?? undefined,
      });

      window.localStorage.setItem(accessTokenStorageKey, session.accessToken);
      router.replace(nextPath);
    } catch (exchangeError) {
      shouldExchangeRef.current = false;
      exchangeStartedRef.current = false;
      setError(toErrorMessage(exchangeError));
      setShouldExchange(false);
      try {
        await logout?.();
      } catch {}
    } finally {
      setIsSubmitting(false);
    }
  }

  const { login } = useLogin({
    onComplete: ({ user: completedUser }) => {
      if (!shouldExchangeRef.current) {
        return;
      }

      void finishExchange(completedUser);
    },
    onError: () => {
      shouldExchangeRef.current = false;
      exchangeStartedRef.current = false;
      setShouldExchange(false);
      setIsSubmitting(false);
      setError("Unable to continue with Privy.");
    },
  });

  useEffect(() => {
    if (!ready || !authenticated || shouldExchangeRef.current || exchangeStartedRef.current) {
      return;
    }

    if (readAccessToken()) {
      router.replace(nextPath);
      return;
    }

    if (autoResumeAttemptedRef.current) {
      return;
    }

    autoResumeAttemptedRef.current = true;
    shouldExchangeRef.current = true;
    setShouldExchange(true);
    setError(null);
    void finishExchange(user);
  }, [authenticated, nextPath, ready, router, user]);

  if (!appId) {
    return null;
  }

  const buttonLabel = isBusy
    ? "Setting up..."
    : "Sign in";

  return (
    <div className="rounded-2xl border border-black/6 bg-white/90 px-6 py-8 shadow-[0_12px_40px_rgba(12,74,39,0.08)] backdrop-blur-sm sm:px-8 sm:py-10">
      <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] leading-[1.1] tracking-[-0.04em] text-[#111111]">
        Welcome back.
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-[#6b7280]">
        Sign in with Google, passkey, or email to continue.
      </p>

      {error ? (
        <div className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#991b1b]">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        disabled={!ready || isBusy}
        onClick={() => {
          if (!ready) {
            return;
          }

          shouldExchangeRef.current = true;
          setShouldExchange(true);
          setError(null);
          exchangeStartedRef.current = false;
          autoResumeAttemptedRef.current = true;

          if (authenticated) {
            void finishExchange(user);
            return;
          }

          setIsSubmitting(true);
          login();
        }}
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-white transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {buttonLabel}
        {!isBusy && <span className="ml-2 text-white/60">→</span>}
      </button>

    </div>
  );
}
