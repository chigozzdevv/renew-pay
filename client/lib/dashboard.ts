import type { DashboardNavItem } from "@/types/dashboard";

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
  { key: "invoices", label: "Invoices", href: "/dashboard/invoices", icon: "receipt" },
  { key: "payments", label: "Payments", href: "/dashboard/payments", icon: "card" },
  { key: "teams", label: "Teams", href: "/dashboard/teams", icon: "team" },
  { key: "developers", label: "Developers", href: "/dashboard/developers", icon: "code" },
  { key: "audit", label: "Audit", href: "/dashboard/audit", icon: "shield" },
  { key: "settings", label: "Settings", href: "/dashboard/settings", icon: "gear" },
];
