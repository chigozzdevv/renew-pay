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
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shouldExchange, setShouldExchange] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const embeddedWalletAddress = useMemo(() => extractEmbeddedWalletAddress(wallets), [wallets]);
  const operatorWalletAddress = embeddedWalletAddress;

  const isBusy = isSubmitting;

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
    if (!authenticated || !shouldExchange || isSubmitting) {
      return;
    }

    void finishExchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticated,
    shouldExchange,
    isSubmitting,
  ]);

  if (!appId) {
    return null;
  }

  const buttonLabel = isBusy
    ? "Setting up..."
    : mode === "signup"
      ? "Create workspace"
      : "Sign in";

  return (
    <div className="rounded-2xl border border-black/6 bg-white/90 px-6 py-8 shadow-[0_12px_40px_rgba(12,74,39,0.08)] backdrop-blur-sm sm:px-8 sm:py-10">
      <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] leading-[1.1] tracking-[-0.04em] text-[#111111]">
        {mode === "signup" ? "Create your workspace." : "Welcome back."}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-[#6b7280]">
        {mode === "signup"
          ? "Sign up with Google, passkey, or email to get started."
          : "Sign in with Google, passkey, or email to continue."}
      </p>

      {mode === "signup" ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 rounded-xl border border-black/8 bg-[#f7f9fc] px-4 text-sm text-[#111111] outline-none transition-colors placeholder:text-[#9ca3af] focus:border-[#111111]"
            placeholder="Full name"
          />
          <input
            type="text"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className="h-11 rounded-xl border border-black/8 bg-[#f7f9fc] px-4 text-sm text-[#111111] outline-none transition-colors placeholder:text-[#9ca3af] focus:border-[#111111]"
            placeholder="Company"
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#991b1b]">
          {error}
          {mode === "login" ? (
            <>
              {" "}
              <Link href="/signup" className="font-medium underline">
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
          isBusy ||
          (mode === "signup" && (!name.trim() || !company.trim()))
        }
        onClick={async () => {
          setShouldExchange(true);
          setError(null);

          if (authenticated) {
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
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-white transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {buttonLabel}
        {!isBusy && <span className="ml-2 text-white/60">→</span>}
      </button>

    </div>
  );
}
