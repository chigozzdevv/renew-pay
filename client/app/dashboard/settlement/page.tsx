"use client";

import { useEffect, useMemo, useState } from "react";

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

type SettlementRouteDraft = {
  name: string;
  routeCode: string;
  provider: SettlementRouteRecord["provider"];
  assetSymbol: string;
  assetMint: string;
  assetDecimals: string;
  destinationAddress: string;
  feeBps: string;
  isDefault: boolean;
};

const EMPTY_DRAFT: SettlementRouteDraft = {
  name: "",
  routeCode: "",
  provider: "direct" as const,
  assetSymbol: "USDC",
  assetMint: "",
  assetDecimals: "6",
  destinationAddress: "",
  feeBps: "0",
  isDefault: false,
};

export default function SettlementPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [provider, setProvider] = useState<SettlementRouteRecord["provider"] | "all">("all");
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
        provider,
        limit: 50,
      }),
    [mode, provider]
  );

  const routes = data?.routes ?? [];

  useEffect(() => {
    if (!message && !errorMessage) return;
    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  const metrics = useMemo(() => {
    const active = routes.filter((route) => route.status === "active").length;
    const privateRoutes = routes.filter((route) => route.mode === "private").length;
    const defaultRoute = routes.find((route) => route.isDefault);

    return {
      total: routes.length,
      active,
      privateRoutes,
      defaultAsset: defaultRoute?.assetSymbol ?? "None",
    };
  }, [routes]);

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
        routeCode: draft.routeCode.trim() || undefined,
        provider: draft.provider,
        mode: draft.provider === "umbra" ? "private" : "standard",
        chain: "solana",
        assetSymbol: draft.assetSymbol.trim().toUpperCase(),
        assetMint: draft.assetMint.trim() || null,
        assetDecimals: Number(draft.assetDecimals),
        destinationAddress: draft.destinationAddress.trim(),
        feeBps: Number(draft.feeBps),
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
    draft.destinationAddress.trim().length > 0 &&
    draft.assetSymbol.trim().length >= 2 &&
    Number(draft.assetDecimals) >= 0 &&
    Number(draft.feeBps) >= 0;

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
        <MetricCard label="Default asset" value={metrics.defaultAsset} />
      </StatGrid>

      <Card
        title="Settlement"
        action={<Button tone="brand" onClick={() => setShowCreate(true)}>New route</Button>}
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <Select value={provider} onChange={(event) => setProvider(event.target.value as SettlementRouteRecord["provider"] | "all")}>
              <option value="all">All providers</option>
              <option value="direct">Standard</option>
              <option value="umbra">Private</option>
            </Select>
          </div>

          {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-[#9a3a31]">{errorMessage}</p> : null}

          <Table columns={["Route", "Asset", "Mode", "Destination", "Status"]}>
            {routes.map((route) => (
              <TableRow key={route.id} columns={5}>
                <button type="button" className="min-w-0 text-left" onClick={() => setDetailRoute(route)}>
                  <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{route.name}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{route.routeCode}</p>
                </button>
                <p className="self-center text-sm font-semibold text-[color:var(--ink)]">{route.assetSymbol}</p>
                <p className="self-center text-sm text-[color:var(--muted)]">{route.mode}</p>
                <p className="truncate self-center text-sm text-[color:var(--muted)]">{route.destinationAddress}</p>
                <div className="flex items-center gap-2 self-center">
                  {route.isDefault ? <StatusBadge value="active">Default</StatusBadge> : null}
                  <StatusBadge value={route.status} />
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
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Name</span>
            <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Code</span>
            <Input value={draft.routeCode} placeholder="optional" onChange={(event) => setDraft((current) => ({ ...current, routeCode: event.target.value }))} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Provider</span>
            <Select value={draft.provider} onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value as SettlementRouteDraft["provider"], assetSymbol: event.target.value === "umbra" ? "USDC" : current.assetSymbol }))}>
              <option value="direct">Standard</option>
              <option value="umbra">Private</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Asset</span>
            <Input value={draft.assetSymbol} disabled={draft.provider === "umbra"} onChange={(event) => setDraft((current) => ({ ...current, assetSymbol: event.target.value.toUpperCase() }))} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Mint</span>
            <Input value={draft.assetMint} placeholder="Optional" disabled={draft.provider === "umbra"} onChange={(event) => setDraft((current) => ({ ...current, assetMint: event.target.value }))} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Decimals</span>
            <Input value={draft.assetDecimals} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, assetDecimals: event.target.value }))} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-[color:var(--muted)]">Destination wallet</span>
            <Input value={draft.destinationAddress} onChange={(event) => setDraft((current) => ({ ...current, destinationAddress: event.target.value }))} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--muted)]">Fee bps</span>
            <Input value={draft.feeBps} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, feeBps: event.target.value }))} />
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-[color:var(--line)] px-3 py-3">
            <input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft((current) => ({ ...current, isDefault: event.target.checked }))} />
            <span className="text-sm font-medium text-[color:var(--ink)]">Default</span>
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
            <Field label="Provider" value={detailRoute.provider} />
            <Field label="Mode" value={detailRoute.mode} />
            <Field label="Asset" value={detailRoute.assetSymbol} />
            <Field label="Mint" value={detailRoute.assetMint ?? "Default"} />
            <Field label="Destination" value={detailRoute.destinationAddress ?? "Not set"} />
            <Field label="Created" value={formatDateTime(detailRoute.createdAt)} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
