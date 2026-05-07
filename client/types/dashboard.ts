export type DashboardRouteKey =
  | "overview"
  | "collections"
  | "settlement"
  | "customers"
  | "payouts"
  | "history"
  | "settings";

export type DashboardNavItem = {
  key: DashboardRouteKey;
  label: string;
  href: string;
  icon:
    | "home"
    | "users"
    | "stack"
    | "receipt"
    | "card"
    | "wallet"
    | "code"
    | "gear";
};
