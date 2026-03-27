import type { DashboardNavItem, DashboardPageContent, DashboardRouteKey } from "@/types/dashboard";

export const dashboardNav: DashboardNavItem[] = [
  { key: "overview", label: "Overview", href: "/dashboard", icon: "home" },
  { key: "customers", label: "Customers", href: "/dashboard/customers", icon: "users" },
  { key: "plans", label: "Plans", href: "/dashboard/plans", icon: "stack" },
  {
    key: "subscriptions",
    label: "Subscriptions",
    href: "/dashboard/subscriptions",
    icon: "refresh",
  },
  { key: "payments", label: "Payments", href: "/dashboard/payments", icon: "card" },
  { key: "treasury", label: "Treasury", href: "/dashboard/treasury", icon: "vault" },
  { key: "governance", label: "Governance", href: "/dashboard/governance", icon: "shield" },
  { key: "teams", label: "Teams", href: "/dashboard/teams", icon: "team" },
  { key: "developers", label: "Developers", href: "/dashboard/developers", icon: "code" },
  { key: "audit", label: "Audit", href: "/dashboard/audit", icon: "shield" },
  { key: "settings", label: "Settings", href: "/dashboard/settings", icon: "gear" },
];

export const dashboardPages: Record<DashboardRouteKey, DashboardPageContent> = {
  overview: {
    key: "overview",
    title: "Overview",
    description: "Monitor collections, renewals, and settlement from one operator view.",
    actions: ["Review renewals", "Open treasury"],
    stats: [
      {
        label: "Active subscriptions",
        value: "1,284",
        note: "Across 20 markets",
        tone: "brand",
      },
      {
        label: "Successful collections",
        value: "96.8%",
        note: "Last 30 days",
      },
      {
        label: "Failed renewals",
        value: "34",
        note: "Need action",
      },
      {
        label: "Pending settlement",
        value: "18,420 USDC",
        note: "Awaiting sweep",
      },
    ],
  },
  customers: {
    key: "customers",
    title: "Customers",
    description: "View accounts, payment health, and market coverage in one list.",
    actions: ["Add customer", "Import list"],
    stats: [
      {
        label: "Active customers",
        value: "842",
        note: "Currently billable",
        tone: "brand",
      },
      {
        label: "Markets",
        value: "20",
        note: "Current environment",
      },
      {
        label: "At-risk accounts",
        value: "16",
        note: "Need follow-up",
      },
      {
        label: "New this month",
        value: "34",
        note: "Recently onboarded",
      },
    ],
  },
  plans: {
    key: "plans",
    title: "Plans",
    description: "Define pricing, intervals, trials, and retry logic without leaving operations.",
    actions: ["New plan", "Duplicate plan"],
    stats: [
      {
        label: "Active plans",
        value: "18",
        note: "Current environment",
        tone: "brand",
      },
      {
        label: "Metered plans",
        value: "4",
        note: "Usage enabled",
      },
      {
        label: "Trials",
        value: "6",
        note: "Deferred start",
      },
    ],
  },
  subscriptions: {
    key: "subscriptions",
    title: "Subscriptions",
    description: "Track every recurring agreement from setup through retry, pause, and renewal.",
    actions: ["Create subscription", "Pause renewal"],
    stats: [
      {
        label: "Active subscriptions",
        value: "1,284",
        note: "Currently renewing",
        tone: "brand",
      },
      {
        label: "Past due",
        value: "51",
        note: "Awaiting retry",
      },
      {
        label: "Paused",
        value: "23",
        note: "Held manually",
      },
    ],
  },
  payments: {
    key: "payments",
    title: "Payments",
    description: "Operate the charge ledger with clear statuses, retries, and export-ready rows.",
    actions: ["Retry charge", "Export ledger"],
    stats: [
      {
        label: "Successful today",
        value: "186",
        note: "Charges cleared",
        tone: "brand",
      },
      {
        label: "Pending reconciliation",
        value: "12",
        note: "Waiting on final state",
      },
      {
        label: "Failed attempts",
        value: "9",
        note: "Require intervention",
      },
    ],
  },
  treasury: {
    key: "treasury",
    title: "Treasury",
    description: "See earnings, payout batches, auto-payout rules, and withdraw status in one place.",
    actions: ["Withdraw now", "Review payout batches"],
    stats: [
      {
        label: "Available balance",
        value: "18,420",
        note: "Ready for payout",
        tone: "brand",
      },
      {
        label: "Pending settlement",
        value: "4,320",
        note: "Still confirming",
      },
      {
        label: "Payout mode",
        value: "Manual",
        note: "Daily / weekly / monthly optional",
      },
    ],
  },
  governance: {
    key: "governance",
    title: "Governance",
    description: "Enable advanced approvals, manage approvers and thresholds, and keep treasury approvals separate from daily operations.",
    actions: ["Enable governance", "Review approvals"],
    stats: [
      {
        label: "Governance",
        value: "Optional",
        note: "Hidden by default",
        tone: "brand",
      },
      {
        label: "Active approvers",
        value: "0",
        note: "Configure only if needed",
      },
      {
        label: "Pending approvals",
        value: "0",
        note: "Governance operations only",
      },
    ],
  },
  teams: {
    key: "teams",
    title: "Teams",
    description: "Manage workspace access, roles, and billing-critical team actions.",
    actions: ["Invite member", "Manage roles"],
    stats: [
      {
        label: "Team members",
        value: "14",
        note: "Across all roles",
        tone: "brand",
      },
      {
        label: "Admins",
        value: "3",
        note: "Full access",
      },
      {
        label: "Pending invites",
        value: "2",
        note: "Awaiting acceptance",
      },
    ],
  },
  developers: {
    key: "developers",
    title: "Developers",
    description: "Keep server keys, webhooks, and event delivery visible while teams integrate.",
    actions: ["Create server key", "Add webhook"],
    stats: [
      {
        label: "Server keys",
        value: "4",
        note: "Current environment",
        tone: "brand",
      },
      {
        label: "Webhook endpoints",
        value: "3",
        note: "Active endpoints",
      },
      {
        label: "Daily events",
        value: "12.8k",
        note: "Average volume",
      },
    ],
  },
  audit: {
    key: "audit",
    title: "Audit",
    description: "Track access, billing, and treasury actions from one review trail.",
    actions: ["Filter activity", "Review approvals"],
    stats: [
      {
        label: "Critical events",
        value: "3",
        note: "Need review",
        tone: "brand",
      },
      {
        label: "Access changes",
        value: "12",
        note: "Last 7 days",
      },
      {
        label: "Treasury approvals",
        value: "8",
        note: "This week",
      },
    ],
  },
  settings: {
    key: "settings",
    title: "Settings",
    description: "Manage workspace defaults, alerts, and security rules.",
    actions: ["Update workspace", "Review security"],
    stats: [
      {
        label: "Workspace profile",
        value: "Ready",
        note: "Identity configured",
        tone: "brand",
      },
      {
        label: "Security rules",
        value: "4",
        note: "Active controls",
      },
      {
        label: "Alerts",
        value: "3",
        note: "Delivery enabled",
      },
    ],
  },
};

export function getDashboardPage(key: DashboardRouteKey) {
  return dashboardPages[key];
}
