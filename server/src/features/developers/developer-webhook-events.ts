export const developerWebhookEventNames = [
  "collection.paid",
  "collection.failed",
  "settlement.settled",
  "settlement.failed",
] as const;

export type DeveloperWebhookEventName =
  (typeof developerWebhookEventNames)[number];

export function isDeveloperWebhookEventName(
  value: string
): value is DeveloperWebhookEventName {
  return (developerWebhookEventNames as readonly string[]).includes(value);
}
