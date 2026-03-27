export type DeveloperWebhookDeliveryJob = {
  deliveryId: string;
  attempt: number;
};

export type PaymentRailSyncJob = {
  country?: string;
};

export type SubscriptionChargeJob = {
  subscriptionId: string;
};

export type SettlementSweepJob = {
  settlementId: string;
};
