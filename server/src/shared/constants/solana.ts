const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isSolanaAddress(value: string | null | undefined) {
  if (typeof value !== "string") {
    return false;
  }

  return SOLANA_ADDRESS_REGEX.test(value.trim());
}

export function normalizeSolanaAddress(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isConfiguredWalletAddress(value: string | null | undefined) {
  return isSolanaAddress(value);
}

export function createUnconfiguredWalletAddress() {
  return "";
}
