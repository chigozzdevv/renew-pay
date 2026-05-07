"use client";

import { useEffect, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import {
  StatusBadge,
  formatCurrency,
  formatDateTime,
} from "@/components/dashboard/dashboard-utils";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Card,
  Input,
  LoadingState,
  PaginationControls,
  PageState,
  Select,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import { loadHistoryPage, type HistoryType } from "@/lib/history";

type HistoryFilter = HistoryType | "all";

export default function HistoryPage() {
  const { mode } = useWorkspaceMode();
  const [type, setType] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadHistoryPage({
        token,
        merchantId,
        environment: mode,
        type,
        search,
        page,
        limit: pageSize,
      }),
    [mode, page, search, type]
  );

  const items = data?.items ?? [];
  const pagination = data?.pagination ?? {
    page,
    limit: pageSize,
    total: items.length,
    totalPages: 1,
  };

  useEffect(() => {
    setPage(1);
  }, [mode, search, type]);

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="History unavailable"
        message={error ?? "Unable to load history."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card title="History">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[190px_minmax(0,1fr)]">
            <Select value={type} onChange={(event) => setType(event.target.value as HistoryFilter)}>
              <option value="all">All events</option>
              <option value="payment">Collections</option>
              <option value="payout">Payouts</option>
              <option value="customer">Customers</option>
              <option value="developer_event">Developer events</option>
              <option value="workspace_event">Workspace events</option>
            </Select>
            <Input
              placeholder="Search reference, customer, or event"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <Table columns={["Event", "Type", "Amount", "Created", "Status"]}>
            {items.map((item) => (
              <TableRow key={`${item.type}-${item.id}`} columns={5}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{item.title}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{item.reference ?? item.id}</p>
                </div>
                <p className="self-center text-sm text-[color:var(--muted)]">{item.type.replace(/_/g, " ")}</p>
                <p className="self-center text-sm font-semibold text-[color:var(--ink)]">
                  {item.amount === null ? "None" : formatCurrency(item.amount, item.currency ?? "USDC")}
                </p>
                <p className="self-center text-sm text-[color:var(--muted)]">{formatDateTime(item.createdAt)}</p>
                <div className="self-center">
                  <StatusBadge value={item.status} />
                </div>
              </TableRow>
            ))}
          </Table>

          <PaginationControls
            page={pagination.page}
            total={pagination.total}
            totalPages={pagination.totalPages}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
          />
        </div>
      </Card>
    </div>
  );
}
