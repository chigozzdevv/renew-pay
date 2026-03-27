function toTreasuryPayload(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

function toScaledIntegerString(amount: number, decimals: number) {
  const fixedAmount = amount.toFixed(decimals);
  const [wholePart, fractionPart = ""] = fixedAmount.split(".");

  return `${wholePart}${fractionPart.padEnd(decimals, "0")}`;
}

export function toUsdcBaseUnits(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("USDC amount must be a finite, non-negative number.");
  }

  return BigInt(toScaledIntegerString(amount, 6));
}

export function fromUsdcBaseUnits(amount: bigint) {
  return Number(amount) / 1_000_000;
}

export function encodeWithdrawCall(amount: number) {
  return toTreasuryPayload({
    instruction: "withdraw",
    amountBaseUnits: toUsdcBaseUnits(amount).toString(),
  });
}

export function encodeWithdrawCallBaseUnits(amount: bigint) {
  return toTreasuryPayload({
    instruction: "withdraw",
    amountBaseUnits: amount.toString(),
  });
}

export function encodePayoutWalletChangeRequestCall(payoutWallet: string) {
  return toTreasuryPayload({
    instruction: "request_payout_wallet_change",
    payoutWallet,
  });
}

export function encodePayoutWalletChangeConfirmCall() {
  return toTreasuryPayload({
    instruction: "confirm_payout_wallet_change",
  });
}

export function encodeReserveWalletUpdateCall(reserveWallet: string) {
  return toTreasuryPayload({
    instruction: "update_reserve_wallet",
    reserveWallet,
  });
}

export function encodeReserveWalletClearCall() {
  return toTreasuryPayload({
    instruction: "clear_reserve_wallet",
  });
}

export function encodeReserveWalletPromoteCall() {
  return toTreasuryPayload({
    instruction: "promote_reserve_wallet",
  });
}
