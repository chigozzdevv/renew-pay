export const developerWebhookEventNames = [
  "payment.failed",
  "payment.settled",
] as const;

export type DeveloperWebhookEventName =
  (typeof developerWebhookEventNames)[number];

export function isDeveloperWebhookEventName(
  value: string
): value is DeveloperWebhookEventName {
  return (developerWebhookEventNames as readonly string[]).includes(value);
}
