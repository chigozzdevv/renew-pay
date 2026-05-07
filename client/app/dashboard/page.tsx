"use client";

import { Card, LoadingState, MetricCard, PageState, StatGrid } from "@/components/dashboard/ui";
import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useResource } from "@/components/dashboard/use-resource";
import {
  formatCurrency,
  formatCompactNumber,
  formatDateTime,
} from "@/components/dashboard/dashboard-utils";
import { loadDashboardOverview } from "@/lib/overview";

export default function OverviewPage() {
  const { mode } = useWorkspaceMode();
  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadDashboardOverview({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Overview unavailable"
        message={error ?? "Unable to load overview."}
        tone="danger"
        action={<button className="text-sm font-semibold" onClick={() => void reload()}>Retry</button>}
      />
    );
  }

  const marketMixPreview = data.marketMix.slice(0, 4);

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard
          label="Customers"
          value={formatCompactNumber(data.stats.totalCustomers)}
        />
        <MetricCard
          label="Open collections"
          value={String(data.stats.openPayments)}
        />
        <MetricCard
          label="Pending payouts"
          value={String(data.stats.pendingPayouts)}
        />
        <MetricCard
          label="Ready net"
          value={formatCurrency(data.stats.payoutReadyUsdc)}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Market mix"
          className="h-full min-h-[24rem] self-auto"
        >
          <div className="space-y-4">
            {marketMixPreview.length === 0 ? (
              <p className="text-sm leading-7 text-[color:var(--muted)]">No market volume yet.</p>
            ) : (
              <>
                {marketMixPreview.map((item) => (
                  <div key={item.currency} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                      <span>{item.currency}</span>
                      <span className="text-[color:var(--muted)]">{item.share}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[color:var(--soft)]">
                      <div
                        className="h-full rounded-full bg-[color:var(--ink)]"
                        style={{ width: `${Math.max(item.share, 4)}%` }}
                      />
                    </div>
                    <p className="text-xs text-[color:var(--muted)]">
                      {item.count} collections · {formatCurrency(item.totalVolume, item.currency)}
                    </p>
                  </div>
                ))}

                {data.marketMix.length > marketMixPreview.length ? (
                  <p className="text-sm text-[color:var(--muted)]">
                    {data.marketMix.length - marketMixPreview.length} more active.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </Card>

        <Card
          title="Recent activity"
          className="h-full min-h-[24rem] self-auto"
        >
          <div className="overflow-hidden rounded-lg border border-[color:var(--line)] bg-white">
            {data.recentActivity.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[color:var(--muted)]">
                No activity
              </p>
            ) : (
              data.recentActivity.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="flex items-center justify-between gap-4 border-b border-[color:var(--line)] px-5 py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[color:var(--ink)]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--muted)]">
                      {item.type} · {item.reference}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[color:var(--ink)]">
                      {formatCurrency(item.amount, item.currency)}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--muted)]">
                      {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
