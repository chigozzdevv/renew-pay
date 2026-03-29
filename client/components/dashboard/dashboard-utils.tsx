"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/dashboard/ui";
import { ApiError, type WorkspaceMode } from "@/lib/api";

export function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
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

export function formatCurrency(value: number, currency = "USDC") {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)} ${currency}`;
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatTxHash(value: string) {
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

export function getSolanaTxUrl(mode: WorkspaceMode, txHash: string) {
  const cluster = mode === "live" ? "mainnet-beta" : "devnet";
  return `https://explorer.solana.com/tx/${txHash}?cluster=${cluster}`;
}

export function statusTone(
  status: string
): "neutral" | "brand" | "warning" | "danger" {
  if (
    ["active", "healthy", "settled", "approved", "executed", "ok", "delivered", "synced"].includes(
      status
    )
  ) {
    return "brand";
  }

  if (
    ["pending", "confirming", "awaiting_settlement", "invited"].includes(status)
  ) {
    return "warning";
  }

  if (
    ["failed", "reversed", "blacklisted", "error", "suspended", "revoked"].includes(
      status
    )
  ) {
    return "danger";
  }

  return "neutral";
}

export function StatusBadge({
  value,
  children,
}: {
  value: string;
  children?: ReactNode;
}) {
  return (
    <Badge tone={statusTone(value)}>
      {children ?? value.replace(/_/g, " ")}
    </Badge>
  );
}

export function toErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}

export function extractPrivyEmbeddedWalletAddress(user: unknown) {
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
