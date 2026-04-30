export type DeveloperWebhookDeliveryJob = {
  deliveryId: string;
  attempt: number;
};

export type OnrampSyncJob = {
  country?: string;
};

export type PayoutProcessingJob = {
  payoutId: string;
};
