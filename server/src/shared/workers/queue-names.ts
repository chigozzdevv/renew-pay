export const queueNames = {
  developerWebhookDelivery: "developer-webhook-delivery",
  notificationDelivery: "notification-delivery",
  onrampSync: "onramp-sync",
  payoutProcessing: "payout-processing",
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];
