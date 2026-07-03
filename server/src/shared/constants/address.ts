const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function isEvmAddress(value: string | null | undefined) {
  if (typeof value !== "string") {
    return false;
  }

  return EVM_ADDRESS_REGEX.test(value.trim());
}

export function normalizeEvmAddress(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return isEvmAddress(normalized) ? normalized : null;
}

export function isConfiguredWalletAddress(value: string | null | undefined) {
  return isEvmAddress(value);
}

export function createUnconfiguredWalletAddress() {
  return null;
}
