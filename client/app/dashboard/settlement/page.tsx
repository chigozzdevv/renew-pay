"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Plus } from "lucide-react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import {
  StatusBadge,
  formatDateTime,
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
  PageState,
  RowActionButton,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import {
  createSettlementAccount,
  loadSettlementAccounts,
  type SettlementAccountRecord,
} from "@/lib/settlement";
import { loadWorkspaceSettings } from "@/lib/settings";

type SettlementAccountDraft = {
  name: string;
  isDefault: boolean;
};

const EMPTY_DRAFT: SettlementAccountDraft = {
  name: "",
  isDefault: false,
};

function formatAddress(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

export default function SettlementPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<SettlementAccountDraft>({ ...EMPTY_DRAFT });
  const [detailAccount, setDetailAccount] = useState<SettlementAccountRecord | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadSettlementAccounts({
        token,
        merchantId,
        environment: mode,
        limit: 50,
      }),
    [mode]
  );
  const { data: settingsData } = useResource(
    async ({ token, merchantId }) =>
      loadWorkspaceSettings({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );
  const accounts = data?.accounts ?? [];
  const defaultPayoutWallet = settingsData?.wallets.primaryWallet ?? "";
  const canUseSettlementWallet = defaultPayoutWallet.length > 0;

  useEffect(() => {
    if (!message && !errorMessage) return;
    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  const metrics = useMemo(() => {
    const active = accounts.filter((account) => account.status === "active").length;
    const defaultAccount = accounts.find((account) => account.isDefault);

    return {
      total: accounts.length,
      active,
      defaultAccount: defaultAccount?.name ?? "None",
    };
  }, [accounts]);

  function openCreateModal() {
    if (!canUseSettlementWallet) {
      setErrorMessage("Add a Stellar payout wallet in Settings first.");
      return;
    }

    setDraft({ ...EMPTY_DRAFT });
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!token || !user?.merchantId) return;

    setIsBusy(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      await createSettlementAccount({
        token,
        merchantId: user.merchantId,
        environment: mode,
        name: draft.name.trim(),
        destinationAddress: defaultPayoutWallet,
        isDefault: draft.isDefault,
      });
      setDraft({ ...EMPTY_DRAFT });
      setShowCreate(false);
      setMessage("Settlement account created.");
      await reload();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  const canCreate =
    draft.name.trim().length >= 2 &&
    canUseSettlementWallet;

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Settlement unavailable"
        message={error ?? "Unable to load settlement accounts."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <StatGrid>
        <MetricCard label="Accounts" value={String(metrics.total)} />
        <MetricCard label="Active" value={String(metrics.active)} />
        <MetricCard label="Asset" value="USDC" />
        <MetricCard label="Default account" value={metrics.defaultAccount} />
      </StatGrid>

      <Card
        title="Settlement"
        action={
          <Button tone="brand" className="gap-2" disabled={!canUseSettlementWallet} onClick={openCreateModal}>
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            New account
          </Button>
        }
      >
        <div className="space-y-4">
          {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-[#9a3a31]">{errorMessage}</p> : null}

          <Table columns={["Account", "Asset", "Payout wallet", "Status", "Actions"]}>
            {accounts.map((account) => (
              <TableRow key={account.id} columns={5}>
                <button type="button" className="min-w-0 text-left" onClick={() => setDetailAccount(account)}>
                  <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{account.name}</p>
                </button>
                <p className="self-center text-sm font-semibold text-[color:var(--ink)]">Stellar USDC</p>
                <p className="truncate self-center text-sm text-[color:var(--muted)]" title={account.destinationAddress ?? undefined}>
                  {formatAddress(account.destinationAddress)}
                </p>
                <div className="flex items-center gap-2 self-center">
                  {account.isDefault ? <StatusBadge value="active">Default</StatusBadge> : null}
                  <StatusBadge value={account.status} />
                </div>
                <div className="flex items-center gap-2 self-center">
                  <RowActionButton
                    label="View account"
                    onClick={() => setDetailAccount(account)}
                  >
                    <Eye className="h-4 w-4" strokeWidth={2.1} />
                  </RowActionButton>
                </div>
              </TableRow>
            ))}
          </Table>
        </div>
      </Card>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New settlement account"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button tone="brand" disabled={isBusy || !canCreate} onClick={() => void handleCreate()}>
              {isBusy ? "Saving..." : "Create"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-[color:var(--muted)]">Account name</span>
            <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <Field label="Settlement" value="Stellar USDC" />
          <Field label="Payout wallet" value={formatAddress(defaultPayoutWallet)} />
          <label className="flex items-center gap-3 md:col-span-2">
            <input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft((current) => ({ ...current, isDefault: event.target.checked }))} />
            <span className="text-sm font-medium text-[color:var(--ink)]">Make default</span>
          </label>
        </div>
      </Modal>

      <Modal
        open={!!detailAccount}
        onClose={() => setDetailAccount(null)}
        title={detailAccount?.name ?? "Settlement account"}
        size="lg"
        footer={<div className="flex justify-end"><Button onClick={() => setDetailAccount(null)}>Close</Button></div>}
      >
        {detailAccount ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Settlement" value="Stellar USDC" />
            <Field label="Payout wallet" value={detailAccount.destinationAddress ?? "Not set"} />
            <Field label="Default" value={detailAccount.isDefault ? "Yes" : "No"} />
            <Field label="Status" value={detailAccount.status} />
            <Field label="Created" value={formatDateTime(detailAccount.createdAt)} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
