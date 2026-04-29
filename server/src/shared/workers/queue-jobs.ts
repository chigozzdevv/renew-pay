export type DeveloperWebhookDeliveryJob = {
  deliveryId: string;
  attempt: number;
};

export type PaymentRailSyncJob = {
  country?: string;
};

export type PayoutProcessingJob = {
  payoutId: string;
};
