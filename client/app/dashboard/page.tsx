"use client";

import Link from "next/link";

import { Card, LoadingState, MetricCard, PageState, StatGrid } from "@/components/dashboard/ui";
import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useResource } from "@/components/dashboard/use-resource";
import {
  formatCurrency,
  formatDateTime,
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

  const previewRenewals = data.upcomingRenewals.slice(0, 2);
  const hasMoreUpcomingRenewals = data.upcomingRenewals.length > previewRenewals.length;
  const marketMixPreview = data.marketMix.slice(0, 4);
  const leadingMarket =
    data.marketMix.length > 0
      ? [...data.marketMix].sort((left, right) => right.share - left.share)[0]
      : null;
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
          <div className="flex min-h-[15rem] flex-col justify-between gap-6">
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Active markets
                </p>
                <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
                  {String(data.marketMix.length)}
                </p>
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  With billing volume.
                </p>
              </div>
              <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Leading market
                </p>
                <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
                  {leadingMarket ? leadingMarket.market : "None"}
                </p>
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  {leadingMarket
                    ? `${leadingMarket.share}% of volume`
                    : "No billing yet."}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="Renewals"
          action={
            data.upcomingRenewals.length > 0 ? (
              <Link
                href="/dashboard/subscriptions"
                className="inline-flex items-center rounded-xl border border-[color:var(--line)] bg-[#f2f1eb] px-3 py-2 text-xs font-semibold tracking-[-0.01em] text-[color:var(--ink)] transition-colors hover:bg-[#ebe9e1]"
              >
                View all
              </Link>
            ) : null
          }
          className="h-full min-h-[24rem] self-auto"
        >
          <div className="flex min-h-[15rem] flex-col justify-between gap-4">
            {data.upcomingRenewals.length === 0 ? (
              <p className="text-sm leading-7 text-[color:var(--muted)]">No renewals in the next 48 hours.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {previewRenewals.map((renewal) => (
                    <div
                      key={renewal.subscriptionId}
                      className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                            {renewal.planName}
                          </p>
                          <p className="mt-1 text-sm text-[color:var(--muted)]">
                            {renewal.customerName}
                          </p>
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand)]">
                          {renewal.billingCurrency}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--muted)]">
                        <span>{formatCurrency(renewal.localAmount, renewal.billingCurrency)}</span>
                        <span>{formatDateTime(renewal.nextChargeAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-[color:var(--line)] bg-[#f2f1eb] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Due soon
                    </p>
                    <p className="font-display text-3xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
                      {String(data.upcomingRenewals.length)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    {hasMoreUpcomingRenewals
                      ? `${data.upcomingRenewals.length - previewRenewals.length} more in subscriptions.`
                      : "Next 48 hours."}
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
