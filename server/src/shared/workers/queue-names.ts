export const queueNames = {
  developerWebhookDelivery: "developer-webhook-delivery",
  notificationDelivery: "notification-delivery",
  paymentRailSync: "payment-rail-sync",
  subscriptionCharge: "subscription-charge",
  settlementBridge: "settlement-bridge",
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];
