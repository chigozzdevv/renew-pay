"use client";

import { useEffect, useMemo, useState } from "react";

import {
  formatDateTime,
  StatusBadge,
} from "@/components/dashboard/dashboard-utils";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Card,
  Field,
  LoadingState,
  MetricCard,
  Modal,
  PageState,
  PaginationControls,
  Select,
  StatGrid,
  Table,
  TableRow,
  Input,
} from "@/components/dashboard/ui";
import { loadAuditLogs, type AuditCategory, type AuditStatus } from "@/lib/audit";

type AuditItem = NonNullable<Awaited<ReturnType<typeof loadAuditLogs>>>["items"][number];

export default function AuditPage() {
  const [category, setCategory] = useState<AuditCategory | "all">("all");
  const [status, setStatus] = useState<AuditStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailItem, setDetailItem] = useState<AuditItem | null>(null);

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadAuditLogs({ token, merchantId, category, status, search, page }),
    [category, page, search, status]
  );

  const items = data?.items ?? [];
  const pagination = data?.pagination ?? {
    page,
    limit: 20,
    total: items.length,
    totalPages: 1,
  };

  useEffect(() => {
    setPage(1);
  }, [category, status, search]);

  const metrics = useMemo(() => {
    const warning = items.filter((item) => item.status === "warning").length;
    const errorCount = items.filter((item) => item.status === "error").length;
    const treasury = items.filter((item) => item.category === "treasury").length;
    return { total: pagination.total, warning, error: errorCount, treasury };
  }, [items, pagination.total]);

  if (isLoading && !data) {
    return <LoadingState />;
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
        <MetricCard label="Audit events" value={String(metrics.total)} note="Matched records" />
        <MetricCard label="Warnings" value={String(metrics.warning)} note="Current page" />
        <MetricCard label="Errors" value={String(metrics.error)} note="Current page" />
        <MetricCard label="Treasury" value={String(metrics.treasury)} note="Treasury-linked events" />
      </StatGrid>

      <Card title="Audit">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Select value={category} onChange={(e) => { setCategory(e.target.value as AuditCategory | "all"); setPage(1); }}>
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
            <Select value={status} onChange={(e) => { setStatus(e.target.value as AuditStatus | "all"); setPage(1); }}>
              <option value="all">All statuses</option>
              <option value="ok">OK</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </Select>
            <Input placeholder="Search actor, target, or action" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>

          <Table columns={["Actor", "Action", "Category", "Time", "Status"]}>
            {items.map((item) => (
              <TableRow key={item.id} columns={5}>
                <button type="button" className="text-left outline-none" onClick={() => setDetailItem(item)}>
                  <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{item.actor}</p>
                </button>
                <div>
                  <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{item.action}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">{item.target ?? item.detail}</p>
                </div>
                <p className="self-center text-sm text-[color:var(--muted)]">{item.category}</p>
                <p className="self-center text-sm text-[color:var(--muted)]">{formatDateTime(item.createdAt)}</p>
                <div className="self-center"><StatusBadge value={item.status} /></div>
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
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        title={detailItem?.action ?? "Audit detail"}
        size="lg"
      >
        {detailItem ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Actor" value={detailItem.actor} />
              <Field label="Status" value={<StatusBadge value={detailItem.status} />} />
              <Field label="Category" value={detailItem.category} />
              <Field label="Time" value={formatDateTime(detailItem.createdAt)} />
            </div>
            {detailItem.target ? (
              <Field label="Target" value={detailItem.target} />
            ) : null}
            <div className="rounded-2xl border border-[color:var(--line)] bg-[#faf9f5] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Metadata
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-[color:var(--line)] bg-white p-3 text-xs leading-6 text-[color:var(--ink)]">
                {JSON.stringify(detailItem.metadata, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
