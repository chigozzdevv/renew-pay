export const renewEventNames = [
  "MerchantRegistered",
  "MerchantStatusUpdated",
  "MerchantPayoutWalletUpdated",
  "PlanCreated",
  "PlanUpdated",
  "SubscriptionCreated",
  "SubscriptionStatusUpdated",
  "ChargeExecuted",
  "ChargeFailed",
  "MerchantWithdrawal",
  "ProtocolFeesWithdrawn",
] as const;

export type RenewEventName = (typeof renewEventNames)[number];

export function isRenewEventName(value: string): value is RenewEventName {
  return renewEventNames.includes(value as RenewEventName);
}
