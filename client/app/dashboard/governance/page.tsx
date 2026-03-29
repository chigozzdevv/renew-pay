"use client";

import { useEffect, useMemo, useState } from "react";

import { usePrivy } from "@privy-io/react-auth";
import {
  useSignMessage,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";

import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useResource } from "@/components/dashboard/use-resource";
import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import {
  extractPrivyEmbeddedWalletAddress,
  toErrorMessage,
} from "@/components/dashboard/dashboard-utils";
import {
  Badge,
  Button,
  Card,
  MetricCard,
  PageState,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import { loadGovernanceState, setGovernanceEnabled } from "@/lib/governance";
import {
  createTreasurySignerChallenge,
  verifyTreasurySigner,
} from "@/lib/treasury";

function formatAddress(value: string | null) {
  if (!value) {
    return "Not provisioned";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not verified";
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

function signerTone(status: string): "brand" | "warning" | "neutral" | "danger" {
  if (status === "active") {
    return "brand";
  }

  if (status === "pending") {
    return "warning";
  }

  if (status === "revoked") {
    return "danger";
  }

  return "neutral";
}

type PrivyWalletRecord = {
  address: string;
  walletClientType?: string;
  chainType?: string;
  type?: string;
};

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function findEmbeddedWallet<T extends PrivyWalletRecord>(wallets: T[]) {
  return (
    wallets.find((entry) => {
      const walletType = entry.chainType ?? entry.type ?? "solana";
      return entry.walletClientType === "privy" && walletType === "solana";
    }) ?? null
  );
}

function findPreferredSolanaWallet<T extends PrivyWalletRecord>(
  wallets: T[],
  preferredAddress: string | null
) {
  const normalizedPreferredAddress = preferredAddress?.trim() ?? null;

  if (normalizedPreferredAddress) {
    const matchedWallet = wallets.find(
      (entry) => entry.address?.trim() === normalizedPreferredAddress
    );

    if (matchedWallet) {
      return matchedWallet;
    }
  }

  const embeddedWallet = findEmbeddedWallet(wallets);

  if (embeddedWallet) {
    return embeddedWallet;
  }

  if (wallets.length === 1) {
    return wallets[0];
  }

  return null;
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

export default function GovernancePage() {
  const { token, user, refresh } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [busyAction, setBusyAction] = useState<"enable" | "disable" | null>(null);
  const [isVerifyingSigner, setIsVerifyingSigner] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { ready: privyReady, authenticated, user: privyUser } = usePrivy();
  const { ready: solanaWalletsReady, wallets } = useSolanaWallets();
  const { signMessage } = useSignMessage();

  const governanceResource = useResource(
    async ({ token }) =>
      loadGovernanceState({
        token,
        environment: mode,
      }),
    [mode]
  );

  const data = governanceResource.data;
  const isLoading = governanceResource.isLoading;
  const error = governanceResource.error;

  const activeApprovers = useMemo(
    () => (data?.approvers ?? []).filter((entry) => entry.status === "active"),
    [data?.approvers]
  );
  const linkedEmbeddedWalletAddress = useMemo(
    () => extractPrivyEmbeddedWalletAddress(privyUser),
    [privyUser]
  );
  const embeddedWallet = useMemo(
    () =>
      findPreferredSolanaWallet(
        wallets,
        linkedEmbeddedWalletAddress ?? user?.operatorWalletAddress?.trim() ?? null
      ),
    [linkedEmbeddedWalletAddress, user?.operatorWalletAddress, wallets]
  );
  const currentSigner = useMemo(
    () =>
      data?.approvers.find((entry) => entry.teamMemberId === user?.teamMemberId) ?? null,
    [data?.approvers, user?.teamMemberId]
  );
  const activeWalletAddress =
    embeddedWallet?.address?.trim() ??
    linkedEmbeddedWalletAddress ??
    user?.operatorWalletAddress?.trim() ??
    null;
  const isWalletSyncing =
    Boolean(authenticated && activeWalletAddress && !embeddedWallet) ||
    Boolean(authenticated && privyReady && !solanaWalletsReady);
  const currentWalletMatchesSigner =
    Boolean(currentSigner?.walletAddress) && currentSigner?.walletAddress === activeWalletAddress;
  const signerStatusTone =
    currentSigner?.status ? signerTone(currentSigner.status) : ("neutral" as const);
  const signerStatusLabel = currentSigner?.status
    ? currentSigner.status.replace(/_/g, " ")
    : isWalletSyncing
      ? "wallet syncing"
      : "not verified";
  const signerActionDisabled =
    !token ||
    !user ||
    user.role !== "owner" ||
    !embeddedWallet ||
    isVerifyingSigner ||
    Boolean(currentSigner && currentSigner.status === "active" && currentWalletMatchesSigner);
  const signerActionLabel = isVerifyingSigner
    ? "Verifying..."
    : isWalletSyncing
      ? "Syncing wallet..."
      : currentSigner?.status === "active" && currentWalletMatchesSigner
        ? "Signer verified"
        : currentSigner?.status === "active"
          ? "Verify this wallet"
          : "Verify my signer";

  async function toggleGovernance(enabled: boolean) {
    if (!token) {
      return;
    }

    setBusyAction(enabled ? "enable" : "disable");
    setErrorMessage(null);
    setMessage(null);

    try {
      await setGovernanceEnabled({
        token,
        environment: mode,
        enabled,
      });
      await Promise.all([governanceResource.reload(), refresh()]);
      setMessage(
        enabled
          ? "Advanced governance is enabled. The page remains hidden by default unless the workspace needs it."
          : "Advanced governance is disabled. The workspace is back in single-owner mode."
      );
    } catch (requestError) {
      setErrorMessage(toErrorMessage(requestError));
    } finally {
      setBusyAction(null);
    }
  }

  async function runSignerVerification() {
    if (!token || !user) {
      return;
    }

    if (user.role !== "owner") {
      setErrorMessage("Only owners can verify a treasury signer.");
      setMessage(null);
      return;
    }

    if (!embeddedWallet) {
      setErrorMessage(
        isWalletSyncing
          ? "Privy is still syncing your Solana wallet into this session."
          : "Your signed-in Privy Solana wallet is not ready yet."
      );
      setMessage(null);
      return;
    }

    setIsVerifyingSigner(true);
    setErrorMessage(null);
    setMessage(null);

    try {
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
      await Promise.all([governanceResource.reload(), refresh()]);
      setMessage("Your signed-in Privy Solana wallet is now verified for treasury approvals.");
    } catch (requestError) {
      setErrorMessage(toErrorMessage(requestError));
    } finally {
      setIsVerifyingSigner(false);
    }
  }

  if (isLoading) {
    return (
      <PageState
        title="Loading governance"
        message="Fetching operator control and approval settings."
        tone="neutral"
      />
    );
  }

  if (error || !data) {
    return (
      <PageState
        title="Governance unavailable"
        message={error ? toErrorMessage(error) : "Unable to load governance state."}
        tone="danger"
      />
    );
  }

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard
          label="Mode"
          value={data.mode === "multisig" ? "Multisig" : "Single owner"}
          note={data.enabled ? "Governance enabled" : "Default mode"}
        />
        <MetricCard
          label="Operator wallet"
          value={formatAddress(data.controllerWalletAddress)}
          note="Operator authority"
        />
        <MetricCard
          label="Payout wallet"
          value={formatAddress(data.payoutWallet)}
          note="Withdraw destination"
        />
        <MetricCard
          label="Approval policy"
          value={`${data.threshold}/${Math.max(data.activeSignerCount, 1)}`}
          note="Required approvals"
        />
      </StatGrid>

      <Card
        title="Governance"
        description="Multi-approval controls for treasury actions."
        action={
          <div className="flex items-center gap-3">
            <Badge tone={data.enabled ? "brand" : "neutral"}>
              {data.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Button
              tone={data.enabled ? "neutral" : "brand"}
              disabled={busyAction !== null}
              onClick={() => toggleGovernance(!data.enabled)}
            >
              {busyAction === "enable"
                ? "Enabling..."
                : busyAction === "disable"
                  ? "Disabling..."
                  : data.enabled
                    ? "Disable"
                    : "Enable"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {message ? (
            <p className="text-sm text-[color:var(--brand)]">{message}</p>
          ) : null}
          {errorMessage ? (
            <p className="text-sm text-[#a8382b]">{errorMessage}</p>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-[1rem] border border-[color:var(--line)] bg-[#f5f4ef] px-4 py-3">
              <span className="text-sm font-medium text-[color:var(--ink)]">Onboarding</span>
              <Badge tone={data.onboardingStatus === "workspace_active" ? "brand" : "warning"}>
                {data.onboardingStatus.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-[1rem] border border-[color:var(--line)] bg-[#f5f4ef] px-4 py-3">
              <span className="text-sm font-medium text-[color:var(--ink)]">Active approvers</span>
              <span className="text-sm font-semibold text-[color:var(--ink)]">
                {activeApprovers.length}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[1rem] border border-[color:var(--line)] bg-[#f5f4ef] px-4 py-3">
              <span className="text-sm font-medium text-[color:var(--ink)]">Current session</span>
              <span className="text-sm font-semibold text-[color:var(--ink)]">
                {user?.name ?? "Unknown"}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Treasury signer"
        description="Verify your Privy wallet for treasury approvals."
        action={
          <Button
            tone="brand"
            disabled={signerActionDisabled}
            onClick={() => void runSignerVerification()}
          >
            {signerActionLabel}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={signerStatusTone}>{signerStatusLabel}</Badge>
          <span className="font-mono text-xs text-[color:var(--muted)]">
            {formatAddress(activeWalletAddress)}
          </span>
        </div>
        {currentSigner?.status === "active" && !currentWalletMatchesSigner ? (
          <p className="mt-3 text-xs text-[#8a5313]">
            Current wallet differs from the bound signer. Re-verifying will rotate approvals.
          </p>
        ) : null}
        {!currentSigner && user?.role !== "owner" ? (
          <p className="mt-3 text-xs text-[color:var(--muted)]">Only owners can bind a signer.</p>
        ) : null}
      </Card>

      <Card
        title="Approvers"
        description="Owners with a verified treasury signer."
      >
        {data.approvers.length === 0 ? (
          <p className="py-6 text-center text-sm text-[color:var(--muted)]">
            No approvers yet. Verify an owner's signer wallet to add them.
          </p>
        ) : (
          <Table columns={["Approver", "Wallet", "Status", "Verified"]}>
            {data.approvers.map((approver) => (
              <TableRow key={approver.id} columns={4}>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">{approver.name}</p>
                  <p className="text-xs text-[color:var(--muted)]">
                    {approver.role} · {approver.email ?? "No email"}
                  </p>
                </div>
                <span className="font-mono text-xs text-[color:var(--muted)]">
                  {formatAddress(approver.walletAddress)}
                </span>
                <Badge tone={signerTone(approver.status)}>
                  {approver.status.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs text-[color:var(--muted)]">
                  {formatDate(approver.verifiedAt)}
                </span>
              </TableRow>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
