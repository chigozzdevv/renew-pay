export const teamRoles = [
  "owner",
  "admin",
  "operations",
  "finance",
  "developer",
  "support",
] as const;

export type TeamRole = (typeof teamRoles)[number];

export const teamPermissions = [
  "customers",
  "plans",
  "subscriptions",
  "payments",
  "treasury",
  "developers",
  "team_admin",
] as const;

export type TeamPermission = (typeof teamPermissions)[number];

const rolePermissionMap: Record<TeamRole, TeamPermission[]> = {
  // Owner/admin roles keep broad policy control for now.
  owner: [
    "customers",
    "plans",
    "subscriptions",
    "payments",
    "treasury",
    "developers",
    "team_admin",
  ],
  admin: [
    "customers",
    "plans",
    "subscriptions",
    "payments",
    "treasury",
    "developers",
    "team_admin",
  ],
  operations: ["customers", "plans", "subscriptions"],
  finance: ["payments", "treasury"],
  developer: ["developers"],
  support: ["customers", "subscriptions"],
};

export function getPermissionsForRole(role: TeamRole) {
  return [...rolePermissionMap[role]];
}

export function normalizePermissions(permissions: string[]) {
  const filtered = permissions.filter((permission): permission is TeamPermission =>
    (teamPermissions as readonly string[]).includes(permission)
  );

  return [...new Set(filtered)];
}

export function describeAccessFromPermissions(permissions: TeamPermission[]) {
  const normalized = new Set(permissions);

  if (
    normalized.has("customers") &&
    normalized.has("plans") &&
    normalized.has("subscriptions") &&
    normalized.has("payments") &&
    normalized.has("treasury") &&
    normalized.has("developers") &&
    normalized.has("team_admin")
  ) {
    return "Full workspace";
  }

  if (normalized.has("payments") && normalized.has("treasury")) {
    return "Payments + treasury";
  }

  if (normalized.has("customers") && normalized.has("subscriptions")) {
    return "Customer support";
  }

  if (normalized.has("developers")) {
    return "API + webhooks";
  }

  if (
    normalized.has("customers") &&
    normalized.has("plans") &&
    normalized.has("subscriptions")
  ) {
    return "Customers + subscriptions";
  }

  return "Custom access";
}
