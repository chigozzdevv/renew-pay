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
  Select,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import {
  createSettlementRoute,
  loadSettlementRoutes,
  type SettlementRouteRecord,
} from "@/lib/settlement";
import { loadWorkspaceSettings } from "@/lib/settings";

type SettlementType = "standard" | "private";

type SettlementRouteDraft = {
  name: string;
  settlementType: SettlementType;
  assetSymbol: string;
  useDefaultWallet: boolean;
  destinationAddress: string;
  isDefault: boolean;
};

const EMPTY_DRAFT: SettlementRouteDraft = {
  name: "",
  settlementType: "standard",
  assetSymbol: "USDC",
  useDefaultWallet: true,
  destinationAddress: "",
  isDefault: false,
};

const SETTLEMENT_ASSETS: Record<SettlementType, Array<{ label: string; value: string }>> = {
  standard: [{ label: "USDC", value: "USDC" }],
  private: [{ label: "USDC", value: "USDC" }],
};

function formatSettlementType(value: SettlementType | SettlementRouteRecord["mode"]) {
  return value === "private" ? "Private settlement" : "Standard settlement";
}

function formatAddress(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

export default function SettlementPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [typeFilter, setTypeFilter] = useState<SettlementType | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<SettlementRouteDraft>({ ...EMPTY_DRAFT });
  const [detailRoute, setDetailRoute] = useState<SettlementRouteRecord | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadSettlementRoutes({
        token,
        merchantId,
        environment: mode,
        mode: typeFilter,
        limit: 50,
      }),
    [mode, typeFilter]
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

  const routes = data?.routes ?? [];
  const defaultPayoutWallet = settingsData?.wallets.primaryWallet ?? "";

  useEffect(() => {
    if (!message && !errorMessage) return;
    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  useEffect(() => {
    if (!showCreate || defaultPayoutWallet) {
      return;
    }

    setDraft((current) => ({ ...current, useDefaultWallet: false }));
  }, [defaultPayoutWallet, showCreate]);

  const metrics = useMemo(() => {
    const active = routes.filter((route) => route.status === "active").length;
    const privateRoutes = routes.filter((route) => route.mode === "private").length;
    const defaultRoute = routes.find((route) => route.isDefault);

    return {
      total: routes.length,
      active,
      privateRoutes,
      defaultRoute: defaultRoute?.name ?? "None",
    };
  }, [routes]);

  function openCreateModal() {
    setDraft({
      ...EMPTY_DRAFT,
      useDefaultWallet: Boolean(defaultPayoutWallet),
    });
    setShowCreate(true);
  }

  function patchSettlementType(nextType: SettlementType) {
    setDraft((current) => {
      const options = SETTLEMENT_ASSETS[nextType];
      const currentAssetIsSupported = options.some((option) => option.value === current.assetSymbol);

      return {
        ...current,
        settlementType: nextType,
        assetSymbol: currentAssetIsSupported ? current.assetSymbol : options[0]?.value ?? "USDC",
      };
    });
  }

  async function handleCreate() {
    if (!token || !user?.merchantId) return;

    setIsBusy(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      await createSettlementRoute({
        token,
        merchantId: user.merchantId,
        environment: mode,
        name: draft.name.trim(),
        settlementType: draft.settlementType,
        assetSymbol: draft.assetSymbol,
        destinationAddress: draft.useDefaultWallet
          ? defaultPayoutWallet
          : draft.destinationAddress.trim(),
        isDefault: draft.isDefault,
      });
      setDraft({ ...EMPTY_DRAFT });
      setShowCreate(false);
      setMessage("Settlement route created.");
      await reload();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  const canCreate =
    draft.name.trim().length >= 2 &&
    draft.assetSymbol.trim().length >= 2 &&
    (draft.useDefaultWallet ? defaultPayoutWallet.length > 0 : draft.destinationAddress.trim().length > 0);

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Settlement unavailable"
        message={error ?? "Unable to load settlement routes."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <StatGrid>
        <MetricCard label="Routes" value={String(metrics.total)} />
        <MetricCard label="Active" value={String(metrics.active)} />
        <MetricCard label="Private" value={String(metrics.privateRoutes)} />
        <MetricCard label="Default route" value={metrics.defaultRoute} />
      </StatGrid>

      <Card
        title="Settlement"
        action={
          <Button tone="brand" className="gap-2" onClick={openCreateModal}>
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            New route
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <Select
              value={typeFilter}
              wrapperClassName="w-44 max-w-full"
              onChange={(event) => setTypeFilter(event.target.value as SettlementType | "all")}
            >
              <option value="all">All types</option>
              <option value="standard">Standard settlement</option>
              <option value="private">Private settlement</option>
            </Select>
          </div>

          {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-[#9a3a31]">{errorMessage}</p> : null}

          <Table columns={["Route", "Type", "Asset", "Payout wallet", "Status", "Actions"]}>
            {routes.map((route) => (
              <TableRow key={route.id} columns={6}>
                <button type="button" className="min-w-0 text-left" onClick={() => setDetailRoute(route)}>
                  <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{route.name}</p>
                </button>
                <p className="self-center text-sm text-[color:var(--muted)]">{formatSettlementType(route.mode)}</p>
                <p className="self-center text-sm font-semibold text-[color:var(--ink)]">{route.assetSymbol}</p>
                <p className="truncate self-center text-sm text-[color:var(--muted)]" title={route.destinationAddress ?? undefined}>
                  {formatAddress(route.destinationAddress)}
                </p>
                <div className="flex items-center gap-2 self-center">
                  {route.isDefault ? <StatusBadge value="active">Default</StatusBadge> : null}
                  <StatusBadge value={route.status} />
                </div>
                <div className="flex items-center gap-2 self-center">
                  <RowActionButton
                    label="View route"
                    onClick={() => setDetailRoute(route)}
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
        title="New settlement route"
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
            <span className="text-xs font-medium text-[color:var(--muted)]">Route name</span>
            <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Settlement type</span>
            <Select value={draft.settlementType} onChange={(event) => patchSettlementType(event.target.value as SettlementType)}>
              <option value="standard">Standard settlement</option>
              <option value="private">Private settlement</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Settlement asset</span>
            <Select value={draft.assetSymbol} onChange={(event) => setDraft((current) => ({ ...current, assetSymbol: event.target.value }))}>
              {SETTLEMENT_ASSETS[draft.settlementType].map((asset) => (
                <option key={asset.value} value={asset.value}>{asset.label}</option>
              ))}
            </Select>
          </label>
          {defaultPayoutWallet ? (
            <label className="flex items-center gap-3 rounded-lg border border-[color:var(--line)] px-3 py-3 md:col-span-2">
              <input type="checkbox" checked={draft.useDefaultWallet} onChange={(event) => setDraft((current) => ({ ...current, useDefaultWallet: event.target.checked }))} />
              <span className="text-sm font-medium text-[color:var(--ink)]">Use default payout wallet</span>
            </label>
          ) : null}
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-[color:var(--muted)]">Payout wallet</span>
            <Input
              value={draft.useDefaultWallet ? defaultPayoutWallet : draft.destinationAddress}
              disabled={draft.useDefaultWallet}
              placeholder="Wallet address"
              onChange={(event) => setDraft((current) => ({ ...current, destinationAddress: event.target.value }))}
            />
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-[color:var(--line)] px-3 py-3">
            <input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft((current) => ({ ...current, isDefault: event.target.checked }))} />
            <span className="text-sm font-medium text-[color:var(--ink)]">Make default</span>
          </label>
        </div>
      </Modal>

      <Modal
        open={!!detailRoute}
        onClose={() => setDetailRoute(null)}
        title={detailRoute?.name ?? "Settlement route"}
        size="lg"
        footer={<div className="flex justify-end"><Button onClick={() => setDetailRoute(null)}>Close</Button></div>}
      >
        {detailRoute ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Settlement type" value={formatSettlementType(detailRoute.mode)} />
            <Field label="Asset" value={detailRoute.assetSymbol} />
            <Field label="Payout wallet" value={detailRoute.destinationAddress ?? "Not set"} />
            <Field label="Default" value={detailRoute.isDefault ? "Yes" : "No"} />
            <Field label="Status" value={detailRoute.status} />
            <Field label="Created" value={formatDateTime(detailRoute.createdAt)} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
