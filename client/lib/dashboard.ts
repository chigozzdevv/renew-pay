import type { DashboardNavItem } from "@/types/dashboard";

export const dashboardNav: DashboardNavItem[] = [
  { key: "overview", label: "Overview", href: "/dashboard", icon: "home" },
  { key: "collections", label: "Collections", href: "/dashboard/collections", icon: "card" },
  { key: "settlement", label: "Settlement", href: "/dashboard/settlement", icon: "stack" },
  { key: "customers", label: "Customers", href: "/dashboard/customers", icon: "users" },
  { key: "payouts", label: "Payouts", href: "/dashboard/payouts", icon: "wallet" },
  { key: "history", label: "History", href: "/dashboard/history", icon: "receipt" },
  { key: "settings", label: "Settings", href: "/dashboard/settings", icon: "gear" },
];
