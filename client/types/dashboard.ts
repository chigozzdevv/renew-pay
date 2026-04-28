export type DashboardRouteKey =
  | "overview"
  | "customers"
  | "plans"
  | "subscriptions"
  | "invoices"
  | "payments"
  | "teams"
  | "developers"
  | "audit"
  | "settings";

export type DashboardNavItem = {
  key: DashboardRouteKey;
  label: string;
  href: string;
  icon:
    | "home"
    | "users"
    | "stack"
    | "refresh"
    | "receipt"
    | "card"
    | "shield"
    | "team"
    | "code"
    | "gear";
};
