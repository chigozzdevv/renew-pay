export type DashboardRouteKey =
  | "overview"
  | "customers"
  | "plans"
  | "subscriptions"
  | "invoices"
  | "payments"
  | "treasury"
  | "governance"
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
    | "vault"
    | "shield"
    | "team"
    | "code"
    | "gear";
};
