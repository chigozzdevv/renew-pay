"use client";

const walletAddressPattern = /^0x[a-fA-F0-9]{40}$/;

export type WalletStatus = {
  address: string;
  connected: boolean;
};

export function normalizeWalletAddress(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return walletAddressPattern.test(normalized) ? normalized : null;
}

export async function connectWallet(value: string | null | undefined) {
  const address = normalizeWalletAddress(value);

  if (!address) {
    throw new Error("Wallet is not ready.");
  }

  return address;
}

export async function checkWalletStatus(address: string): Promise<WalletStatus> {
  const normalizedAddress = normalizeWalletAddress(address);

  if (!normalizedAddress) {
    throw new Error("Wallet is invalid.");
  }

  return {
    address: normalizedAddress,
    connected: true,
  };
}
