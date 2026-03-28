export type DashboardRouteKey =
  | "overview"
  | "customers"
  | "plans"
  | "subscriptions"
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
    | "card"
    | "vault"
    | "shield"
    | "team"
    | "code"
    | "gear";
};
