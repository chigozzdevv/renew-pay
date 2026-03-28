"use client";

import { useEffect, useMemo, useState } from "react";

import {
  formatDateTime,
  StatusBadge,
} from "@/components/dashboard/dashboard-utils";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Card,
  DarkCard,
  DarkField,
  MetricCard,
  PageState,
  Select,
  StatGrid,
  Table,
  TableRow,
  Input,
} from "@/components/dashboard/ui";
import { loadAuditLogs, type AuditCategory, type AuditStatus } from "@/lib/audit";

export default function AuditPage() {
  const [category, setCategory] = useState<AuditCategory | "all">("all");
  const [status, setStatus] = useState<AuditStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadAuditLogs({
        token,
        merchantId,
        category,
        status,
        search,
        page,
      }),
    [category, page, search, status]
  );

  const items = data?.items ?? [];
  const pagination = data?.pagination ?? {
    page,
    limit: 20,
    total: items.length,
    totalPages: 1,
  };
  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  useEffect(() => {
    if (!selectedItem) {
      setSelectedId(null);
      return;
    }

    setSelectedId(selectedItem.id);
  }, [selectedItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const metrics = useMemo(() => {
    const warning = items.filter((item) => item.status === "warning").length;
    const errorCount = items.filter((item) => item.status === "error").length;
    const treasury = items.filter((item) => item.category === "treasury").length;

    return {
      total: pagination.total,
      warning,
      error: errorCount,
      treasury,
    };
  }, [items, pagination.total]);

  if (isLoading && !data) {
    return <PageState title="Loading audit log" message="Fetching real audit events." />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Audit unavailable"
        message={error ?? "Unable to load audit log."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard label="Audit events" value={String(metrics.total)} note="Matched records" tone="brand" />
        <MetricCard label="Warnings" value={String(metrics.warning)} note="Current page" />
        <MetricCard label="Errors" value={String(metrics.error)} note="Current page" />
        <MetricCard label="Treasury" value={String(metrics.treasury)} note="Treasury-linked events" />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card title="Audit log" description="Real workspace, billing, treasury, and developer events.">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Select value={category} onChange={(event) => { setCategory(event.target.value as AuditCategory | "all"); setPage(1); }}>
                <option value="all">All categories</option>
                <option value="workspace">Workspace</option>
                <option value="team">Team</option>
                <option value="billing">Billing</option>
                <option value="security">Security</option>
                <option value="developer">Developer</option>
                <option value="payments">Payments</option>
                <option value="treasury">Treasury</option>
                <option value="protocol">Protocol</option>
              </Select>
              <Select value={status} onChange={(event) => { setStatus(event.target.value as AuditStatus | "all"); setPage(1); }}>
                <option value="all">All statuses</option>
                <option value="ok">OK</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </Select>
              <Input placeholder="Search actor, target, or action" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            </div>

            <Table columns={["Actor", "Action", "Category", "Time", "Status"]}>
              {items.map((item) => (
                <button key={item.id} type="button" className="text-left" onClick={() => setSelectedId(item.id)}>
                  <TableRow columns={5}>
                    <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{item.actor}</p>
                    <div>
                      <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{item.action}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">{item.target ?? item.detail}</p>
                    </div>
                    <p className="text-sm text-[color:var(--muted)]">{item.category}</p>
                    <p className="text-sm text-[color:var(--muted)]">{formatDateTime(item.createdAt)}</p>
                    <div><StatusBadge value={item.status} /></div>
                  </TableRow>
                </button>
              ))}
            </Table>

            <div className="flex items-center justify-between gap-3">
              <button
                className="text-sm font-semibold text-[color:var(--ink)] disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <p className="text-sm text-[color:var(--muted)]">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <button
                className="text-sm font-semibold text-[color:var(--ink)] disabled:opacity-40"
                disabled={page >= pagination.totalPages}
                onClick={() =>
                  setPage((current) => Math.min(pagination.totalPages, current + 1))
                }
              >
                Next
              </button>
            </div>
          </div>
        </Card>

        <DarkCard
          title={selectedItem?.action ?? "Audit detail"}
          description={selectedItem?.detail ?? "Select an audit event to inspect it."}
        >
          {selectedItem ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DarkField label="Actor" value={selectedItem.actor} />
                <DarkField
                  label="Status"
                  value={<StatusBadge value={selectedItem.status} />}
                />
                <DarkField label="Category" value={selectedItem.category} />
                <DarkField
                  label="Time"
                  value={formatDateTime(selectedItem.createdAt)}
                />
              </div>

              {selectedItem.target ? (
                <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/46">
                    Target
                  </p>
                  <p className="mt-2 text-sm leading-7 text-white/82">
                    {selectedItem.target}
                  </p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/46">
                  Metadata
                </p>
                <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-6 text-white/80">
                  {JSON.stringify(selectedItem.metadata, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-7 text-white/66">
              No audit event matches the current filter.
            </p>
          )}
        </DarkCard>
      </div>
    </div>
  );
}
