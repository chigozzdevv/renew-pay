"use client";

import { useEffect, useMemo, useState } from "react";

import { usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet as useCreateSolanaWallet,
  useSignMessage,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";

import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useAuthedResource } from "@/components/dashboard/use-authed-resource";
import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import {
  Badge,
  Button,
  Card,
  DarkCard,
  MetricCard,
  PageState,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import { toErrorMessage } from "@/components/dashboard/surface-utils";
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

export function GovernanceSurface() {
  const { token, user, refresh } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [busyAction, setBusyAction] = useState<"enable" | "disable" | null>(null);
  const [isVerifyingSigner, setIsVerifyingSigner] = useState(false);
  const [isProvisioningWallet, setIsProvisioningWallet] = useState(false);
  const [walletBootstrapAttempted, setWalletBootstrapAttempted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { ready: privyReady, authenticated } = usePrivy();
  const { ready: solanaWalletsReady, wallets } = useSolanaWallets();
  const { createWallet } = useCreateSolanaWallet();
  const { signMessage } = useSignMessage();

  const governanceResource = useAuthedResource(
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
  const embeddedWallet = useMemo(() => findEmbeddedWallet(wallets), [wallets]);
  const currentSigner = useMemo(
    () =>
      data?.approvers.find((entry) => entry.teamMemberId === user?.teamMemberId) ?? null,
    [data?.approvers, user?.teamMemberId]
  );
  const activeWalletAddress =
    embeddedWallet?.address?.trim() ?? user?.operatorWalletAddress?.trim() ?? null;
  const currentWalletMatchesSigner =
    Boolean(currentSigner?.walletAddress) && currentSigner?.walletAddress === activeWalletAddress;
  const signerStatusTone =
    currentSigner?.status ? signerTone(currentSigner.status) : ("neutral" as const);
  const signerStatusLabel = currentSigner?.status
    ? currentSigner.status.replace(/_/g, " ")
    : isProvisioningWallet
      ? "wallet provisioning"
      : "not verified";
  const signerActionDisabled =
    !token ||
    !user ||
    user.role !== "owner" ||
    !embeddedWallet ||
    isProvisioningWallet ||
    isVerifyingSigner ||
    Boolean(currentSigner && currentSigner.status === "active" && currentWalletMatchesSigner);
  const signerActionLabel = isVerifyingSigner
    ? "Verifying..."
    : isProvisioningWallet
      ? "Provisioning wallet..."
      : currentSigner?.status === "active" && currentWalletMatchesSigner
        ? "Signer verified"
        : currentSigner?.status === "active"
          ? "Verify this wallet"
          : "Verify my signer";

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

        setWalletBootstrapAttempted(false);
        setErrorMessage(toErrorMessage(walletError));
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
        isProvisioningWallet
          ? "Privy is still provisioning your Solana wallet."
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
      <DarkCard
        title="Advanced governance"
        description="Governance stays hidden in the default workspace. Turn it on only when treasury actions need more than one human approval."
        action={
          <div className="flex items-center gap-3">
            <Badge tone={data.enabled ? "brand" : "neutral"}>
              {data.enabled ? "Enabled" : "Hidden by default"}
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
                    ? "Disable governance"
                    : "Enable governance"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {message ? (
            <div className="rounded-[1.1rem] border border-[#cde8d4] bg-[#f4fbf6] px-4 py-3 text-sm text-[#0c4a27]">
              {message}
            </div>
          ) : null}
          {errorMessage ? (
            <div className="rounded-[1.1rem] border border-[#f0ccc3] bg-[#fff6f4] px-4 py-3 text-sm text-[#9b3b2d]">
              {errorMessage}
            </div>
          ) : null}
          <StatGrid>
            <MetricCard
              label="Mode"
              value={data.mode === "multisig" ? "Multisig" : "Single owner"}
              note={data.enabled ? "Advanced controls enabled" : "Default workspace mode"}
              tone={data.enabled ? "brand" : "neutral"}
            />
            <MetricCard
              label="Operator wallet"
              value={formatAddress(data.controllerWalletAddress)}
              note="Privy-provisioned operator authority"
            />
            <MetricCard
              label="Payout wallet"
              value={formatAddress(data.payoutWallet)}
              note="Treasury withdraw destination"
            />
            <MetricCard
              label="Approval policy"
              value={`${data.threshold}/${Math.max(data.activeSignerCount, 1)}`}
              note="Recommended live approval threshold"
            />
          </StatGrid>
        </div>
      </DarkCard>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card
          title="Control model"
          description="Routine billing and settlement stay on the operator lane. Governance only applies to sensitive changes and large treasury actions."
        >
          <div className="space-y-3 text-sm leading-7 text-[color:var(--muted)]">
            <p>
              The operator wallet handles day-to-day plan, subscription, invoice, and payout flows.
              Governance adds an approval layer on top of that instead of becoming the default path
              for every action.
            </p>
            <p>
              When governance is off, the workspace stays in single-owner mode. When governance is
              on, approvers can be enrolled gradually and the navigation remains optional for teams
              that do not need it day to day.
            </p>
          </div>
        </Card>

        <Card
          title="Readiness"
          description="The important thing is whether the workspace can safely move from single-owner control into shared approvals."
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-[1rem] border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-3">
              <span className="text-sm font-medium text-[color:var(--ink)]">
                Onboarding status
              </span>
              <Badge tone={data.onboardingStatus === "workspace_active" ? "brand" : "warning"}>
                {data.onboardingStatus.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-[1rem] border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-3">
              <span className="text-sm font-medium text-[color:var(--ink)]">
                Active approvers
              </span>
              <span className="text-sm font-semibold text-[color:var(--ink)]">
                {activeApprovers.length}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[1rem] border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-3">
              <span className="text-sm font-medium text-[color:var(--ink)]">
                Current owner session
              </span>
              <span className="text-sm font-semibold text-[color:var(--ink)]">
                {user?.name ?? "Unknown"}
              </span>
            </div>
            <div className="rounded-[1rem] border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-[color:var(--ink)]">
                      Treasury signer wallet
                    </p>
                    <Badge tone={signerStatusTone}>{signerStatusLabel}</Badge>
                  </div>
                  <p className="font-mono text-xs text-[color:var(--muted)]">
                    {formatAddress(activeWalletAddress)}
                  </p>
                  <p className="text-xs leading-6 text-[color:var(--muted)]">
                    Renew uses the signed-in Privy Solana wallet for signer verification. Owners
                    do not need to pick or paste a wallet manually.
                  </p>
                  {currentSigner?.status === "active" && !currentWalletMatchesSigner ? (
                    <p className="text-xs leading-6 text-[#8a5313]">
                      Your current Privy wallet is different from the wallet already bound for
                      approvals. Verifying again will rotate treasury approvals to this session
                      wallet.
                    </p>
                  ) : null}
                  {!currentSigner && user?.role !== "owner" ? (
                    <p className="text-xs leading-6 text-[color:var(--muted)]">
                      Only owners can bind a treasury signer.
                    </p>
                  ) : null}
                </div>
                <Button
                  tone="brand"
                  disabled={signerActionDisabled}
                  onClick={() => void runSignerVerification()}
                >
                  {signerActionLabel}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Approvers"
        description="Approvers are owners with a verified treasury signer binding. They are staged here even when governance stays hidden from the main dashboard."
      >
        {data.approvers.length === 0 ? (
          <PageState
            title="No approvers yet"
            message="Add an owner, verify that owner's Privy signer wallet, then enable governance when you actually need shared approvals."
            tone="neutral"
          />
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
