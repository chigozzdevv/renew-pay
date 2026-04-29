export const appPermissions = [
  "customers",
  "payments",
  "settlement",
  "payouts",
  "history",
  "developers",
  "settings",
] as const;

export type AppPermission = (typeof appPermissions)[number];

export function getOwnerPermissions() {
  return [...appPermissions];
}

export function normalizePermissions(permissions: string[]) {
  const filtered = permissions.filter((permission): permission is AppPermission =>
    (appPermissions as readonly string[]).includes(permission)
  );

  return [...new Set(filtered)];
}

export function describeAccessFromPermissions(permissions: AppPermission[]) {
  const normalized = new Set(permissions);

  if (appPermissions.every((permission) => normalized.has(permission))) {
    return "Full workspace";
  }

  if (
    normalized.has("payments") &&
    normalized.has("settlement") &&
    normalized.has("payouts")
  ) {
    return "Payments + settlement";
  }

  if (normalized.has("customers") && normalized.has("payments")) {
    return "Customer support";
  }

  if (normalized.has("developers")) {
    return "API + webhooks";
  }

  if (normalized.has("history")) {
    return "History";
  }

  return "Custom access";
}
