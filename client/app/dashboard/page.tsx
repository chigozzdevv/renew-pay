"use client";

import Link from "next/link";

import { Card, LoadingState, MetricCard, PageState, StatGrid } from "@/components/dashboard/ui";
import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useResource } from "@/components/dashboard/use-resource";
import {
  formatCurrency,
  formatCompactNumber,
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
  const quickActions = [
    { href: "/dashboard/plans", label: "Create plan" },
    { href: "/dashboard/customers", label: "Add customer" },
    { href: "/dashboard/subscriptions", label: "View subscriptions" },
    { href: "/dashboard/teams", label: "Add team" },
  ];

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard
          label="Customers"
          value={formatCompactNumber(data.stats.totalCustomers)}
        />
        <MetricCard
          label="Plans"
          value={String(data.stats.activePlans)}
        />
        <MetricCard
          label="Subscriptions"
          value={formatCompactNumber(data.stats.activeSubscriptions)}
        />
        <MetricCard
          label="Ready net"
          value={formatCurrency(data.stats.readyNetUsdc)}
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
                  <div key={item.market} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                      <span>{item.market}</span>
                      <span className="text-[color:var(--muted)]">{item.share}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-[#e9e7df]">
                      <div
                        className="h-full rounded-full bg-[#111111]"
                        style={{ width: `${Math.max(item.share, 4)}%` }}
                      />
                    </div>
                    <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      {formatCurrency(item.totalVolume)}
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
          title="Quick actions"
          className="h-full min-h-[24rem] self-auto"
        >
          <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--line)] bg-white">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center justify-between gap-4 border-b border-[color:var(--line)] px-5 py-5 text-[color:var(--ink)] transition-colors hover:bg-[#fafafd] last:border-b-0"
              >
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-3 w-3 shrink-0 rounded-full bg-[#d9dde5]" />
                  <span className="text-lg font-semibold tracking-[-0.03em]">
                    {action.label}
                  </span>
                </div>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="h-5 w-5 shrink-0 text-[#b0b7c3]"
                  fill="none"
                >
                  <path
                    d="M7 5l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
