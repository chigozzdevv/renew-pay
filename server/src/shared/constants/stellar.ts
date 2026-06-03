const stellarAddressPattern = /^[GMC][A-Z2-7]{55}$/;

export function isStellarAddress(value: string | null | undefined) {
  return typeof value === "string" && stellarAddressPattern.test(value.trim());
}

export function normalizeStellarAddress(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return isStellarAddress(normalized) ? normalized : null;
}
