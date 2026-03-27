export const developerWebhookEventNames = [
  "charge.failed",
  "charge.settled",
] as const;

export type DeveloperWebhookEventName =
  (typeof developerWebhookEventNames)[number];

export function isDeveloperWebhookEventName(
  value: string
): value is DeveloperWebhookEventName {
  return (developerWebhookEventNames as readonly string[]).includes(value);
}
