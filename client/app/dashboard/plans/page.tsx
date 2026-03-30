"use client";

import { useEffect, useMemo, useState } from "react";

import { usePrivy } from "@privy-io/react-auth";
import {
  useSignMessage,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { MarketMultiSelect } from "@/components/dashboard/market-controls";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import {
  StatusBadge,
  extractPrivyEmbeddedWalletAddress,
  formatCurrency,
  formatTxHash,
  getSolanaTxUrl,
  toErrorMessage,
} from "@/components/dashboard/dashboard-utils";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Button,
  Card,
  Field,
  Input,
  LoadingState,
  MetricCard,
  Modal,
  PaginationControls,
  PageState,
  Select,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import { loadBillingMarketCatalog } from "@/lib/markets";
import { createPlan, loadPlansPage, updatePlan, type PlanRecord } from "@/lib/plans";
import {
  approveTreasuryOperation,
  createTreasurySignerChallenge,
  executeTreasuryOperation,
  getTreasuryOperationSigningPayload,
  verifyTreasurySigner,
} from "@/lib/treasury";

type PlanStatusFilter = PlanRecord["status"] | "all";
type PrivyWalletRecord = {
  address: string;
  walletClientType?: string;
  chainType?: string;
  type?: string;
};

const EMPTY_DRAFT = {
  planCode: "",
  name: "",
  usdAmount: "",
  usageRate: "",
  intervalPreset: "monthly" as string,
  billingIntervalDays: "",
  trialDays: "",
  retryPreset: "24" as string,
  retryWindowHours: "",
  billingMode: "fixed" as PlanRecord["billingMode"],
  supportedMarkets: [] as string[],
};

const BILLING_INTERVALS: Record<string, { label: string; days: number }> = {
  weekly: { label: "Weekly", days: 7 },
  monthly: { label: "Monthly", days: 30 },
  quarterly: { label: "Quarterly", days: 90 },
  annually: { label: "Annually", days: 365 },
  custom: { label: "Custom", days: 0 },
};

const RETRY_WINDOWS: Record<string, { label: string; hours: number }> = {
  "12": { label: "12 hours", hours: 12 },
  "24": { label: "24 hours", hours: 24 },
  "48": { label: "48 hours", hours: 48 },
  "72": { label: "72 hours", hours: 72 },
  custom: { label: "Custom", hours: 0 },
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

export default function PlansPage() {
  const { token, user, refresh } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const { ready: privyReady, authenticated, user: privyUser } = usePrivy();
  const { ready: solanaWalletsReady, wallets } = useSolanaWallets();
  const { signMessage } = useSignMessage();
  const [status, setStatus] = useState<PlanStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [detailPlan, setDetailPlan] = useState<PlanRecord | null>(null);
  const [editPlan, setEditPlan] = useState<PlanRecord | null>(null);
  const [archivePlan, setArchivePlan] = useState<PlanRecord | null>(null);

  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [editDraft, setEditDraft] = useState({ ...EMPTY_DRAFT });

  const pageSize = 20;

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadPlansPage({
        token,
        merchantId,
        environment: mode,
        status,
        search,
        page,
        limit: pageSize,
      }),
    [mode, page, status, search]
  );
  const { data: marketCatalog } = useResource(
    async ({ token, merchantId }) =>
      loadBillingMarketCatalog({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );

  const plans = data?.plans ?? [];
  const pagination = data?.pagination ?? {
    page,
    limit: pageSize,
    total: plans.length,
    totalPages: 1,
  };
  const merchantMarketOptions =
    marketCatalog?.markets.filter((market) =>
      marketCatalog.merchantSupportedMarkets.includes(market.currency)
    ) ?? [];
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
  const activeWalletAddress =
    embeddedWallet?.address?.trim() ??
    linkedEmbeddedWalletAddress ??
    user?.operatorWalletAddress?.trim() ??
    null;
  const isWalletSyncing =
    Boolean(authenticated && activeWalletAddress && !embeddedWallet) ||
    Boolean(authenticated && privyReady && !solanaWalletsReady);

  useEffect(() => {
    if (!message && !errorMessage) return;
    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  useEffect(() => {
    setPage(1);
  }, [mode, search, status]);

  const metrics = useMemo(() => {
    const active = plans.filter((p) => p.status === "active").length;
    const metered = plans.filter((p) => p.billingMode === "metered").length;
    const markets = new Set(plans.flatMap((p) => p.supportedMarkets)).size;
    return { total: pagination.total, active, metered, markets };
  }, [pagination.total, plans]);

  function resolvedIntervalDays(d: typeof draft): number {
    if (d.intervalPreset === "custom") return Number.parseInt(d.billingIntervalDays, 10) || 0;
    return BILLING_INTERVALS[d.intervalPreset]?.days ?? 30;
  }

  function resolvedRetryHours(d: typeof draft): number {
    if (d.retryPreset === "custom") return Number.parseInt(d.retryWindowHours, 10) || 24;
    return RETRY_WINDOWS[d.retryPreset]?.hours ?? 24;
  }

  async function runAction(key: string, runner: () => Promise<void>) {
    setIsBusy(key);
    setMessage(null);
    setErrorMessage(null);
    try {
      await runner();
      await reload();
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsBusy(null);
    }
  }

  async function ensureCurrentWalletVerified() {
    if (!token || !user) {
      throw new Error("Dashboard session is missing. Sign in again.");
    }

    if (user.role !== "owner") {
      throw new Error("This plan change is waiting for an owner treasury approval.");
    }

    if (!embeddedWallet) {
      throw new Error(
        isWalletSyncing
          ? "Privy is still syncing your Solana wallet into this session."
          : "Your signed-in Privy Solana wallet is not ready yet."
      );
    }

    const boundWallet = user.operatorWalletAddress?.trim() ?? null;

    if (boundWallet && boundWallet !== embeddedWallet.address.trim()) {
      throw new Error(
        "Your signed-in Privy wallet does not match the current treasury signer."
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
    await refresh();
  }

  async function finalizePlanOperation(input: {
    plan: PlanRecord;
    successMessage: string;
    pendingMessage: string;
  }) {
    if (!token || !user) {
      return input.pendingMessage;
    }

    const operationId = input.plan.onchain.operationId?.trim() ?? null;

    if (!operationId) {
      return input.successMessage;
    }

    if (user.role !== "owner") {
      return input.pendingMessage;
    }

    if (!embeddedWallet) {
      throw new Error(
        isWalletSyncing
          ? "Privy is still syncing your Solana wallet into this session."
          : "Your signed-in Privy Solana wallet is not ready yet."
      );
    }

    const boundWallet = user.operatorWalletAddress?.trim() ?? null;

    if (boundWallet && boundWallet !== embeddedWallet.address.trim()) {
      throw new Error(
        "Your signed-in Privy wallet does not match the current treasury signer."
      );
    }

    let signingPayload;

    try {
      signingPayload = await getTreasuryOperationSigningPayload({
        token,
        operationId,
      });
    } catch (error) {
      if (toErrorMessage(error) !== "Treasury signer is not verified for this team member.") {
        throw error;
      }

      await ensureCurrentWalletVerified();
      signingPayload = await getTreasuryOperationSigningPayload({
        token,
        operationId,
      });
    }

    const signedApproval = await signMessage({
      message: new TextEncoder().encode(signingPayload.signingPayload.message),
      wallet: embeddedWallet,
    });

    const approvedOperation = await approveTreasuryOperation({
      token,
      operationId,
      signature: encodeBase58(signedApproval.signature),
    });

    if (!approvedOperation.canExecute) {
      return input.pendingMessage;
    }

    await executeTreasuryOperation({
      token,
      operationId,
    });

    return input.successMessage;
  }

  function isCreateValid() {
    return (
      draft.planCode.trim() &&
      draft.name.trim() &&
      draft.usdAmount.trim() &&
      (draft.intervalPreset !== "custom" || draft.billingIntervalDays.trim()) &&
      draft.supportedMarkets.length > 0
    );
  }

  function isEditValid() {
    return (
      editDraft.planCode.trim() &&
      editDraft.name.trim() &&
      editDraft.usdAmount.trim() &&
      (editDraft.intervalPreset !== "custom" || editDraft.billingIntervalDays.trim()) &&
      editDraft.supportedMarkets.length > 0
    );
  }

  async function handleCreate(publishStatus: PlanRecord["status"]) {
    if (!token || !user?.merchantId) return;
    await runAction("create-plan", async () => {
      const createdPlan = await createPlan({
        token,
        merchantId: user.merchantId,
        environment: mode,
        planCode: draft.planCode.trim().toUpperCase(),
        name: draft.name.trim(),
        usdAmount: Number(draft.usdAmount),
        usageRate: draft.usageRate.trim() ? Number(draft.usageRate) : null,
        billingIntervalDays: resolvedIntervalDays(draft),
        trialDays: draft.trialDays.trim() ? Number(draft.trialDays) : 0,
        retryWindowHours: resolvedRetryHours(draft),
        billingMode: draft.billingMode,
        supportedMarkets: draft.supportedMarkets,
        status: publishStatus,
      });
      setShowCreate(false);
      setDraft({ ...EMPTY_DRAFT });

      if (publishStatus !== "active") {
        setMessage("Plan saved as draft.");
        return;
      }

      try {
        const nextMessage = await finalizePlanOperation({
          plan: createdPlan,
          successMessage: "Plan published.",
          pendingMessage: "Plan publish is waiting for approval.",
        });
        setMessage(nextMessage);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        setMessage("Plan publish is waiting for approval.");
      }
    });
  }

  function openEdit(plan: PlanRecord) {
    const intervalEntry = Object.entries(BILLING_INTERVALS).find(
      ([k, v]) => k !== "custom" && v.days === plan.billingIntervalDays
    );
    const retryEntry = Object.entries(RETRY_WINDOWS).find(
      ([k, v]) => k !== "custom" && v.hours === plan.retryWindowHours
    );
    setEditDraft({
      planCode: plan.planCode,
      name: plan.name,
      usdAmount: String(plan.usdAmount),
      usageRate: plan.usageRate != null ? String(plan.usageRate) : "",
      intervalPreset: intervalEntry ? intervalEntry[0] : "custom",
      billingIntervalDays: intervalEntry ? "" : String(plan.billingIntervalDays),
      trialDays: String(plan.trialDays),
      retryPreset: retryEntry ? retryEntry[0] : "custom",
      retryWindowHours: retryEntry ? "" : String(plan.retryWindowHours),
      billingMode: plan.billingMode,
      supportedMarkets: [...plan.supportedMarkets],
    });
    setEditPlan(plan);
  }

  async function handleEdit() {
    if (!token || !editPlan) return;
    await runAction("edit-plan", async () => {
      const updatedPlan = await updatePlan({
        token,
        planId: editPlan.id,
        environment: mode,
        payload: {
          planCode: editDraft.planCode.trim().toUpperCase(),
          name: editDraft.name.trim(),
          usdAmount: Number(editDraft.usdAmount),
          usageRate: editDraft.usageRate.trim() ? Number(editDraft.usageRate) : null,
          billingIntervalDays: resolvedIntervalDays(editDraft),
          trialDays: editDraft.trialDays.trim() ? Number(editDraft.trialDays) : 0,
          retryWindowHours: resolvedRetryHours(editDraft),
          billingMode: editDraft.billingMode,
          supportedMarkets: editDraft.supportedMarkets,
        },
      });
      setEditPlan(null);

      try {
        const nextMessage = await finalizePlanOperation({
          plan: updatedPlan,
          successMessage: "Plan updated.",
          pendingMessage: "Plan update is waiting for approval.",
        });
        setMessage(nextMessage);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        setMessage("Plan update is waiting for approval.");
      }
    });
  }

  async function handleArchive() {
    if (!token || !archivePlan) return;
    await runAction("archive-plan", async () => {
      const updatedPlan = await updatePlan({
        token,
        planId: archivePlan.id,
        environment: mode,
        payload: { status: "archived" },
      });
      setArchivePlan(null);

      try {
        const nextMessage = await finalizePlanOperation({
          plan: updatedPlan,
          successMessage: "Plan archived.",
          pendingMessage: "Plan archive is waiting for approval.",
        });
        setMessage(nextMessage);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        setMessage("Plan archive is waiting for approval.");
      }
    });
  }

  async function handleStatusChange(plan: PlanRecord, nextStatus: PlanRecord["status"]) {
    if (!token) return;
    await runAction("update-status", async () => {
      const updatedPlan = await updatePlan({
        token,
        planId: plan.id,
        environment: mode,
        payload: { status: nextStatus },
      });
      setDetailPlan(null);

      const successMessage =
        nextStatus === "active"
          ? "Plan published."
          : nextStatus === "draft"
            ? "Plan unpublished."
            : nextStatus === "archived"
              ? "Plan archived."
              : "Plan status updated.";
      const pendingMessage =
        nextStatus === "active"
          ? "Plan publish is waiting for approval."
          : nextStatus === "draft"
            ? "Plan unpublish is waiting for approval."
            : nextStatus === "archived"
              ? "Plan archive is waiting for approval."
              : "Plan status change is waiting for approval.";

      try {
        const nextMessage = await finalizePlanOperation({
          plan: updatedPlan,
          successMessage,
          pendingMessage,
        });
        setMessage(nextMessage);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        setMessage(pendingMessage);
      }
    });
  }

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Plans unavailable"
        message={error ?? "Unable to load plans."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  function renderPlanForm(
    d: typeof draft,
    setD: React.Dispatch<React.SetStateAction<typeof draft>>
  ) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[color:var(--muted)]">Plan name</label>
          <Input placeholder="e.g. Pro Monthly" value={d.name} onChange={(e) => setD((c) => ({ ...c, name: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[color:var(--muted)]">
            Plan ID
            <span className="ml-1.5 font-normal normal-case tracking-normal text-[color:var(--muted)]/70">— short API reference code</span>
          </label>
          <Input placeholder="e.g. PRO_NGN_M" value={d.planCode} onChange={(e) => setD((c) => ({ ...c, planCode: e.target.value.toUpperCase() }))} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[color:var(--muted)]">Price (USD)</label>
          <Input placeholder="e.g. 9.99" value={d.usdAmount} onChange={(e) => setD((c) => ({ ...c, usdAmount: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[color:var(--muted)]">Billing mode</label>
          <Select value={d.billingMode} onChange={(e) => setD((c) => ({ ...c, billingMode: e.target.value as PlanRecord["billingMode"] }))}>
            <option value="fixed">Fixed — same charge every cycle</option>
            <option value="metered">Metered — charges based on usage</option>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="block text-xs font-semibold text-[color:var(--muted)]">
            Billing interval
            {d.intervalPreset !== "custom" && (
              <span className="ml-1.5 font-normal normal-case tracking-normal text-[color:var(--muted)]/70">
                — {BILLING_INTERVALS[d.intervalPreset]?.days ?? 0} days
              </span>
            )}
          </label>
          <div className="flex gap-2">
            <Select value={d.intervalPreset} onChange={(e) => setD((c) => ({ ...c, intervalPreset: e.target.value, billingIntervalDays: "" }))}>
              {Object.entries(BILLING_INTERVALS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
            {d.intervalPreset === "custom" ? (
              <Input placeholder="Days" value={d.billingIntervalDays} onChange={(e) => setD((c) => ({ ...c, billingIntervalDays: e.target.value }))} />
            ) : null}
          </div>
        </div>
        {d.billingMode === "metered" ? (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">Usage rate (per unit)</label>
            <Input placeholder="e.g. 0.05" value={d.usageRate} onChange={(e) => setD((c) => ({ ...c, usageRate: e.target.value }))} />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[color:var(--muted)]">Trial period</label>
          <Input placeholder="Days (0 = no trial)" value={d.trialDays} onChange={(e) => setD((c) => ({ ...c, trialDays: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[color:var(--muted)]">Retry window</label>
          <div className="flex gap-2">
            <Select value={d.retryPreset} onChange={(e) => setD((c) => ({ ...c, retryPreset: e.target.value, retryWindowHours: "" }))}>
              {Object.entries(RETRY_WINDOWS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
            {d.retryPreset === "custom" ? (
              <Input placeholder="Hours" value={d.retryWindowHours} onChange={(e) => setD((c) => ({ ...c, retryWindowHours: e.target.value }))} />
            ) : null}
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="block text-xs font-semibold text-[color:var(--muted)]">Billing markets</label>
          <MarketMultiSelect
            options={merchantMarketOptions}
            value={d.supportedMarkets}
            onChange={(supportedMarkets) => setD((c) => ({ ...c, supportedMarkets }))}
            allLabel="All merchant markets"
            placeholder="Select billing markets"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard label="Plans" value={String(metrics.total)} note="Configured billing plans" />
        <MetricCard label="Active" value={String(metrics.active)} note="Visible page" />
        <MetricCard label="Metered" value={String(metrics.metered)} note="Visible page" />
        <MetricCard label="Markets" value={String(metrics.markets)} note="Visible page" />
      </StatGrid>

      <Card
        title="Plans"
        action={<Button tone="brand" onClick={() => { setDraft({ ...EMPTY_DRAFT }); setShowCreate(true); }}>Create plan</Button>}
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <Select value={status} onChange={(e) => { setStatus(e.target.value as PlanStatusFilter); setPage(1); }}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
            <Input
              placeholder="Search by plan name or code"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-[#a8382b]">{errorMessage}</p> : null}

          <Table columns={["Plan", "Mode", "Price", "Markets", "Actions"]}>
            {plans.map((plan) => (
              <TableRow key={plan.id} columns={5}>
                <button type="button" className="text-left outline-none" onClick={() => setDetailPlan(plan)}>
                  <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{plan.name}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">{plan.planCode}</p>
                </button>
                <p className="self-center text-sm text-[color:var(--muted)]">{plan.billingMode}</p>
                <p className="self-center text-sm text-[color:var(--muted)]">{formatCurrency(plan.usdAmount, "USD")}</p>
                <div className="flex items-center gap-1.5 self-center">
                  <span className="text-sm text-[color:var(--muted)]">
                    {plan.supportedMarkets.slice(0, 2).join(", ")}
                  </span>
                  {plan.supportedMarkets.length > 2 ? (
                    <span className="inline-flex items-center rounded-full bg-[#ebe9e1] px-1.5 py-0.5 text-[11px] font-semibold text-[color:var(--brand)]">
                      +{plan.supportedMarkets.length - 2}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 self-center">
                  <StatusBadge value={plan.status} />
                  <button
                    type="button"
                    onClick={() => openEdit(plan)}
                    className="rounded-xl border border-[#111111] bg-[#111111] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
                  >
                    Edit
                  </button>
                  {plan.status !== "archived" ? (
                    <button
                      type="button"
                      onClick={() => setArchivePlan(plan)}
                      className="rounded-xl border border-[#dcb7b0] bg-[#fff7f6] px-3 py-1.5 text-xs font-semibold text-[#922f25] transition-colors hover:bg-[#ffefed]"
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </TableRow>
            ))}
          </Table>

          <PaginationControls
            page={pagination.page}
            total={pagination.total}
            totalPages={pagination.totalPages}
            onPrevious={() => setPage((c) => Math.max(1, c - 1))}
            onNext={() => setPage((c) => Math.min(pagination.totalPages, c + 1))}
          />
        </div>
      </Card>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create plan"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={isBusy === "create-plan" || !isCreateValid()}
              onClick={() => void handleCreate("draft")}
            >
              {isBusy === "create-plan" ? "Saving..." : "Save as draft"}
            </Button>
            <Button
              tone="brand"
              disabled={isBusy === "create-plan" || !isCreateValid()}
              onClick={() => void handleCreate("active")}
            >
              {isBusy === "create-plan" ? "Publishing..." : "Publish"}
            </Button>
          </div>
        }
      >
        {renderPlanForm(draft, setDraft)}
      </Modal>

      <Modal
        open={!!detailPlan}
        onClose={() => setDetailPlan(null)}
        title={detailPlan?.name ?? "Plan details"}
        size="lg"
        footer={
          detailPlan ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {detailPlan.onchain.txHash ? (
                  <a
                    href={getSolanaTxUrl(mode, detailPlan.onchain.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)] transition-colors hover:bg-[#f5f4ef]"
                  >
                    View tx
                    <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                    </svg>
                  </a>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {detailPlan.status === "draft" ? (
                  <Button
                    tone="brand"
                    disabled={isBusy === "update-status"}
                    onClick={() => void handleStatusChange(detailPlan, "active")}
                  >
                    {isBusy === "update-status" ? "Publishing..." : "Publish"}
                  </Button>
                ) : detailPlan.status === "active" ? (
                  <Button
                    disabled={isBusy === "update-status"}
                    onClick={() => void handleStatusChange(detailPlan, "draft")}
                  >
                    {isBusy === "update-status" ? "Updating..." : "Unpublish"}
                  </Button>
                ) : null}
                <Button
                  onClick={() => {
                    setDetailPlan(null);
                    openEdit(detailPlan);
                  }}
                >
                  Edit
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {detailPlan ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="USD price" value={formatCurrency(detailPlan.usdAmount, "USD")} />
            <Field label="Status" value={<StatusBadge value={detailPlan.status} />} />
            <Field label="Mode" value={detailPlan.billingMode} />
            <Field label="Interval" value={`${detailPlan.billingIntervalDays} days`} />
            <Field label="Trial" value={`${detailPlan.trialDays} days`} />
            <Field label="Retry window" value={`${detailPlan.retryWindowHours} hours`} />
            <Field label="Onchain status" value={<StatusBadge value={detailPlan.onchain.status} />} />
            <Field label="Protocol plan" value={detailPlan.onchain.id ?? "Pending"} />
            <Field
              label="Markets"
              value={
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {detailPlan.supportedMarkets.map((m) => (
                    <span key={m} className="inline-flex items-center rounded-lg border border-[color:var(--line)] bg-[#f5f4ef] px-2 py-0.5 text-xs font-semibold text-[color:var(--brand)]">
                      {m}
                    </span>
                  ))}
                </div>
              }
            />
            <Field
              label="Latest tx"
              value={
                detailPlan.onchain.txHash ? (
                  <a
                    href={getSolanaTxUrl(mode, detailPlan.onchain.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block max-w-full break-all text-[color:var(--ink)] underline decoration-[color:var(--line)] underline-offset-4 transition-colors hover:text-[color:var(--muted)] [overflow-wrap:anywhere]"
                  >
                    {formatTxHash(detailPlan.onchain.txHash)}
                  </a>
                ) : (
                  "Waiting for execution"
                )
              }
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!editPlan}
        onClose={() => setEditPlan(null)}
        title="Edit plan"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setEditPlan(null)}>Cancel</Button>
            <Button
              tone="brand"
              disabled={isBusy === "edit-plan" || !isEditValid()}
              onClick={() => void handleEdit()}
            >
              {isBusy === "edit-plan" ? "Saving..." : "Save changes"}
            </Button>
          </div>
        }
      >
        {renderPlanForm(editDraft, setEditDraft)}
      </Modal>

      <Modal
        open={!!archivePlan}
        onClose={() => setArchivePlan(null)}
        title="Archive plan"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setArchivePlan(null)}>Cancel</Button>
            <Button
              tone="danger"
              disabled={isBusy === "archive-plan"}
              onClick={() => void handleArchive()}
            >
              {isBusy === "archive-plan" ? "Archiving..." : "Archive"}
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-7 text-[color:var(--muted)]">
          Are you sure you want to archive <span className="font-semibold text-[color:var(--ink)]">{archivePlan?.name}</span>? Archived plans cannot accept new subscriptions.
        </p>
      </Modal>
    </div>
  );
}
