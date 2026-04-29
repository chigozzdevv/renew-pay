import { runDeveloperWebhookDeliveryJob } from "@/features/developers/developer-webhook-delivery.service";
import { runNotificationDeliveryJob } from "@/features/notifications/notification.service";
import { runPaymentRailSyncJob } from "@/features/payment-rails/payment-rails.service";
import { runPayoutProcessingJob } from "@/features/payouts/payout.service";
import { queueNames } from "@/shared/workers/queue-names";
import { registerQueueProcessor } from "@/shared/workers/queue-runtime";

let processorsRegistered = false;

export function registerWorkerProcessors() {
  if (processorsRegistered) {
    return;
  }

  registerQueueProcessor(queueNames.developerWebhookDelivery, async (payload) =>
    runDeveloperWebhookDeliveryJob(payload as { deliveryId: string; attempt: number })
  );

  registerQueueProcessor(queueNames.notificationDelivery, async (payload) =>
    runNotificationDeliveryJob(payload as { notificationId: string })
  );

  registerQueueProcessor(queueNames.paymentRailSync, async (payload) =>
    runPaymentRailSyncJob(payload as { country?: string; environment: "test" | "live" })
  );

  registerQueueProcessor(queueNames.payoutProcessing, async (payload) =>
    runPayoutProcessingJob(payload as { payoutId: string })
  );

  processorsRegistered = true;
}
