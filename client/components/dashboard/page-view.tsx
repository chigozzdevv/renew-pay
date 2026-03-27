"use client";

import type { DashboardPageContent } from "@/types/dashboard";

import { AuditSurface } from "@/components/dashboard/audit-surface";
import { CustomersSurface } from "@/components/dashboard/customers-surface";
import { DevelopersSurface } from "@/components/dashboard/developers-surface";
import { GovernanceSurface } from "@/components/dashboard/governance-surface";
import { OverviewSurface } from "@/components/dashboard/overview-surface";
import { PaymentsSurface } from "@/components/dashboard/payments-surface";
import { PlansSurface } from "@/components/dashboard/plans-surface";
import { SettingsPageSurface } from "@/components/dashboard/settings-surface";
import { SubscriptionsSurface } from "@/components/dashboard/subscriptions-surface";
import { TeamsSurface } from "@/components/dashboard/teams-surface";
import { TreasuryEarningsSurface } from "@/components/dashboard/treasury-earnings-surface";

type DashboardPageViewProps = {
  page: DashboardPageContent;
};

export function DashboardPageView({ page }: DashboardPageViewProps) {
  return (
    <section className="space-y-6">
      {page.key === "overview" ? (
        <OverviewSurface />
      ) : page.key === "customers" ? (
        <CustomersSurface />
      ) : page.key === "plans" ? (
        <PlansSurface />
      ) : page.key === "subscriptions" ? (
        <SubscriptionsSurface />
      ) : page.key === "payments" ? (
        <PaymentsSurface />
      ) : page.key === "treasury" ? (
        <TreasuryEarningsSurface />
      ) : page.key === "governance" ? (
        <GovernanceSurface />
      ) : page.key === "developers" ? (
        <DevelopersSurface />
      ) : page.key === "teams" ? (
        <TeamsSurface />
      ) : page.key === "settings" ? (
        <SettingsPageSurface />
      ) : (
        <AuditSurface />
      )}
    </section>
  );
}
