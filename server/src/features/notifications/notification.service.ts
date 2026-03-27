import { env } from "@/config/env.config";
import { ChargeModel } from "@/features/charges/charge.model";
import { CustomerModel } from "@/features/customers/customer.model";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { NotificationModel } from "@/features/notifications/notification.model";
import {
  buildNotificationTemplatePreviewPayload,
  notificationTemplateKeys,
  notificationTemplateCatalog,
  renderNotificationTemplate,
  type NotificationTemplateBranding,
  type NotificationTemplateKey,
  type NotificationTemplatePayload,
} from "@/features/notifications/notification.template";
import { PlanModel } from "@/features/plans/plan.model";
import { getOrCreateMerchantSetting } from "@/features/settings/setting.factory";
import { SubscriptionModel } from "@/features/subscriptions/subscription.model";
import { TeamMemberModel } from "@/features/teams/team.model";
import { TreasuryOperationModel } from "@/features/treasury/treasury-operation.model";
import { PayoutBatchModel } from "@/features/treasury/payout-batch.model";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";

type NotificationRecipient = {
  email: string;
  name: string | null;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getAppBaseUrl() {
  return trimTrailingSlash(env.APP_BASE_URL.trim() || "http://localhost:3000");
}

function getCustomerPortalBaseUrl(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return getAppBaseUrl();
  }

  if (/^https?:\/\//i.test(normalized)) {
    return trimTrailingSlash(normalized);
  }

  return `https://${trimTrailingSlash(normalized)}`;
}

function isResendConfigured() {
  return env.RESEND_API_KEY.trim().length > 0 && env.RESEND_FROM_EMAIL.trim().length > 0;
}

function getDashboardUrl(path: string) {
  return `${getAppBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function toEnvironment(value: string | undefined | null): RuntimeMode {
  return value === "live" ? "live" : "test";
}

function toLowerEmail(value: string) {
  return value.trim().toLowerCase();
}

function createDuplicateKeyErrorMessage(idempotencyKey: string) {
  return `Notification with idempotency key "${idempotencyKey}" already exists.`;
}

function createNotificationIdempotencyKey(parts: Array<string | null | undefined>) {
  return parts
    .flatMap((entry) => (entry && entry.trim() ? [entry.trim()] : []))
    .join(":")
    .slice(0, 240);
}

function createSupportMailto(email: string, merchantName: string) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    `${merchantName} support`
  )}`;
}

async function loadMerchantBranding(merchantId: string) {
  const [merchant, setting] = await Promise.all([
    MerchantModel.findById(merchantId).exec(),
    getOrCreateMerchantSetting(merchantId),
  ]);

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return {
    merchant,
    setting,
    branding: {
      merchantName: merchant.name,
      supportEmail: setting.supportEmail,
      brandAccent: setting.brandAccent,
      emailLogoUrl: setting.emailLogoUrl ?? null,
    } satisfies NotificationTemplateBranding,
  };
}

async function resolveMerchantRecipients(input: {
  merchantId: string;
  group: "billing" | "treasury" | "verification" | "team" | "developer" | "security";
}) {
  const members = await TeamMemberModel.find({
    merchantId: input.merchantId,
    status: "active",
  })
    .select({ email: 1, name: 1, role: 1, permissions: 1 })
    .lean()
    .exec();

  const filtered = members.filter((member) => {
    const permissions = new Set(member.permissions ?? []);

    switch (input.group) {
      case "billing":
        return (
          ["owner", "admin", "finance", "operations"].includes(member.role) ||
          permissions.has("payments") ||
          permissions.has("subscriptions") ||
          permissions.has("team_admin")
        );
      case "treasury":
        return (
          ["owner", "admin", "finance"].includes(member.role) ||
          permissions.has("treasury") ||
          permissions.has("team_admin")
        );
      case "verification":
      case "team":
      case "security":
        return ["owner", "admin"].includes(member.role) || permissions.has("team_admin");
      case "developer":
        return (
          ["owner", "admin", "developer"].includes(member.role) ||
          permissions.has("developers") ||
          permissions.has("team_admin")
        );
    }
  });

  const recipients = (filtered.length > 0 ? filtered : members).map((member) => ({
    email: member.email,
    name: member.name ?? null,
  }));

  return Array.from(
    new Map(
      recipients.map((recipient) => [toLowerEmail(recipient.email), recipient])
    ).values()
  );
}

async function createNotificationRecord(input: {
  merchantId: string;
  environment: RuntimeMode;
  templateKey: NotificationTemplateKey;
  audience: "customer" | "merchant" | "team";
  category: string;
  recipient: NotificationRecipient;
  payload: NotificationTemplatePayload;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
}) {
  const { branding } = await loadMerchantBranding(input.merchantId);
  const rendered = renderNotificationTemplate({
    templateKey: input.templateKey,
    branding,
    payload: input.payload,
  });

  const normalizedIdempotencyKey = input.idempotencyKey?.trim()
    ? input.idempotencyKey.trim()
    : null;

  try {
    return await NotificationModel.create({
      merchantId: input.merchantId,
      environment: input.environment,
      templateKey: input.templateKey,
      category: input.category,
      audience: input.audience,
      recipientEmail: toLowerEmail(input.recipient.email),
      recipientName: input.recipient.name,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      provider: "resend",
      status: "queued",
      idempotencyKey: normalizedIdempotencyKey,
      metadata: input.metadata ?? {},
      errorMessage: null,
    });
  } catch (error) {
    const duplicateKeyError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      Number((error as { code?: number }).code) === 11000;

    if (!duplicateKeyError || !normalizedIdempotencyKey) {
      throw error;
    }

    const existing = await NotificationModel.findOne({
      idempotencyKey: normalizedIdempotencyKey,
    }).exec();

    if (!existing) {
      throw new HttpError(409, createDuplicateKeyErrorMessage(normalizedIdempotencyKey));
    }

    return existing;
  }
}

async function queueNotificationRecord(notificationId: string) {
  const queuedJob = await enqueueQueueJob(
    queueNames.notificationDelivery,
    "notification-delivery",
    { notificationId },
    {
      attempts: 5,
      jobId: `notification-delivery-${notificationId}`,
    }
  );

  if (!queuedJob) {
    await runNotificationDeliveryJob({
      notificationId,
    });
  }
}

async function sendWithResend(input: {
  notificationId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyToEmail: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.notificationId,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL.trim(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: env.RESEND_REPLY_TO_EMAIL.trim() || input.replyToEmail,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string }
    | null;

  if (!response.ok || !payload?.id) {
    throw new Error(payload?.message ?? "Resend request failed.");
  }

  return payload.id;
}

export async function runNotificationDeliveryJob(input: {
  notificationId: string;
}) {
  const notification = await NotificationModel.findById(input.notificationId).exec();

  if (!notification) {
    throw new HttpError(404, "Notification was not found.");
  }

  if (notification.status === "sent" || notification.status === "skipped") {
    return notification;
  }

  const { setting } = await loadMerchantBranding(notification.merchantId.toString());

  if (!isResendConfigured()) {
    notification.status = "skipped";
    notification.errorMessage = "Resend is not configured.";
    notification.failedAt = new Date();
    await notification.save();
    return notification;
  }

  try {
    const providerMessageId = await sendWithResend({
      notificationId: notification._id.toString(),
      to: notification.recipientEmail,
      subject: notification.subject,
      html: notification.html,
      text: notification.text,
      replyToEmail: setting.supportEmail,
    });

    notification.status = "sent";
    notification.providerMessageId = providerMessageId;
    notification.errorMessage = null;
    notification.sentAt = new Date();
    notification.failedAt = null;
    await notification.save();
    return notification;
  } catch (error) {
    notification.status = "failed";
    notification.errorMessage =
      error instanceof Error ? error.message : "Notification delivery failed.";
    notification.failedAt = new Date();
    await notification.save();
    throw error;
  }
}

export async function listNotificationTemplates(
  merchantId: string,
  environment: RuntimeMode
) {
  const { branding } = await loadMerchantBranding(merchantId);

  return notificationTemplateKeys.map((templateKey) => ({
    key: templateKey,
    ...notificationTemplateCatalog[templateKey],
    subjectPreview: renderNotificationTemplate({
      templateKey,
      branding,
      payload: buildNotificationTemplatePreviewPayload(templateKey),
    }).subject,
    environment,
  }));
}

export async function previewNotificationTemplate(input: {
  merchantId: string;
  templateKey: NotificationTemplateKey;
  environment: RuntimeMode;
}) {
  const { branding } = await loadMerchantBranding(input.merchantId);
  const rendered = renderNotificationTemplate({
    templateKey: input.templateKey,
    branding,
    payload: buildNotificationTemplatePreviewPayload(input.templateKey),
  });

  return {
    key: input.templateKey,
    ...notificationTemplateCatalog[input.templateKey],
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    environment: input.environment,
  };
}

export async function queueTeamInviteNotification(input: {
  merchantId: string;
  environment: RuntimeMode;
  teamMemberId: string;
  kind: "sent" | "resent";
}) {
  const { merchant, setting } = await loadMerchantBranding(input.merchantId);

  if (!setting.teamInviteEmails) {
    return null;
  }

  const member = await TeamMemberModel.findOne({
    _id: input.teamMemberId,
    merchantId: input.merchantId,
  })
    .select({ email: 1, name: 1, role: 1 })
    .exec();

  if (!member) {
    return null;
  }

  const notification = await createNotificationRecord({
    merchantId: input.merchantId,
    environment: input.environment,
    templateKey: input.kind === "resent" ? "team.invite.resent" : "team.invite.sent",
    audience: "team",
    category: "team",
    recipient: {
      email: member.email,
      name: member.name,
    },
    payload: {
      recipientName: member.name,
      role: member.role,
      inviteUrl: `${getAppBaseUrl()}/login`,
      supportUrl: createSupportMailto(setting.supportEmail, merchant.name),
    },
    metadata: {
      teamMemberId: member._id.toString(),
      role: member.role,
    },
    idempotencyKey: createNotificationIdempotencyKey([
      "team",
      input.kind,
      member._id.toString(),
      member.email,
      input.kind === "resent" ? String(Date.now()) : null,
    ]),
  });

  await queueNotificationRecord(notification._id.toString());
  return notification;
}

export async function queueSubscriptionCreatedNotifications(input: {
  merchantId: string;
  environment: RuntimeMode;
  subscriptionId: string;
}) {
  const [subscription, customer, plan, setting] = await Promise.all([
    SubscriptionModel.findById(input.subscriptionId).exec(),
    SubscriptionModel.findById(input.subscriptionId)
      .select({ customerRef: 1 })
      .lean()
      .exec()
      .then((entry) =>
        entry
          ? CustomerModel.findOne({
              merchantId: input.merchantId,
              environment: input.environment,
              customerRef: entry.customerRef,
            }).exec()
          : null
      ),
    SubscriptionModel.findById(input.subscriptionId)
      .select({ planId: 1 })
      .lean()
      .exec()
      .then((entry) => (entry?.planId ? PlanModel.findById(entry.planId).exec() : null)),
    getOrCreateMerchantSetting(input.merchantId),
  ]);

  if (!subscription) {
    return [];
  }

  const notifications = [];
  const portalUrl = getCustomerPortalBaseUrl(setting.customerDomain);

  if (customer?.email && setting.customerSubscriptionEmails) {
    const notification = await createNotificationRecord({
      merchantId: input.merchantId,
      environment: input.environment,
      templateKey: "customer.subscription.created",
      audience: "customer",
      category: "billing",
      recipient: {
        email: customer.email,
        name: customer.name,
      },
      payload: {
        customerName: customer.name,
        planName: plan?.name ?? "Subscription",
        amount: `${subscription.billingCurrency} ${subscription.localAmount.toLocaleString()}`,
        nextChargeAt: subscription.nextChargeAt,
        portalUrl,
      },
      metadata: {
        subscriptionId: subscription._id.toString(),
        customerRef: subscription.customerRef,
      },
      idempotencyKey: createNotificationIdempotencyKey([
        "customer-subscription-created",
        subscription._id.toString(),
        customer.email,
      ]),
    });
    await queueNotificationRecord(notification._id.toString());
    notifications.push(notification);
  }

  if (setting.merchantSubscriptionAlerts) {
    const recipients = await resolveMerchantRecipients({
      merchantId: input.merchantId,
      group: "billing",
    });

    for (const recipient of recipients) {
      const notification = await createNotificationRecord({
        merchantId: input.merchantId,
        environment: input.environment,
        templateKey: "merchant.subscription.created",
        audience: "merchant",
        category: "billing",
        recipient,
        payload: {
          customerName: customer?.name ?? subscription.customerName,
          planName: plan?.name ?? "Subscription",
          amount: `${subscription.billingCurrency} ${subscription.localAmount.toLocaleString()}`,
          dashboardUrl: getDashboardUrl("/dashboard/subscriptions"),
        },
        metadata: {
          subscriptionId: subscription._id.toString(),
        },
        idempotencyKey: createNotificationIdempotencyKey([
          "merchant-subscription-created",
          subscription._id.toString(),
          recipient.email,
        ]),
      });
      await queueNotificationRecord(notification._id.toString());
      notifications.push(notification);
    }
  }

  return notifications;
}

export async function queueChargeStatusNotifications(input: {
  chargeId: string;
  previousStatus: string | null;
  nextStatus: string;
}) {
  const charge = await ChargeModel.findById(input.chargeId).exec();

  if (!charge) {
    return [];
  }

  const environment = toEnvironment(charge.environment);
  const [subscription, customer, plan, setting] = await Promise.all([
    SubscriptionModel.findById(charge.subscriptionId).exec(),
    SubscriptionModel.findById(charge.subscriptionId)
      .select({ customerRef: 1, merchantId: 1 })
      .lean()
      .exec()
      .then((entry) =>
        entry
          ? CustomerModel.findOne({
              merchantId: entry.merchantId,
              environment,
              customerRef: entry.customerRef,
            }).exec()
          : null
      ),
    SubscriptionModel.findById(charge.subscriptionId)
      .select({ planId: 1 })
      .lean()
      .exec()
      .then((entry) => (entry?.planId ? PlanModel.findById(entry.planId).exec() : null)),
    getOrCreateMerchantSetting(charge.merchantId.toString()),
  ]);

  if (!subscription) {
    return [];
  }

  const notifications = [];
  const amount = `${subscription.billingCurrency} ${charge.localAmount.toLocaleString()}`;
  const portalUrl = getCustomerPortalBaseUrl(setting.customerDomain);

  const sendReceipt =
    (input.nextStatus === "awaiting_settlement" || input.nextStatus === "settled") &&
    input.previousStatus !== "awaiting_settlement" &&
    input.previousStatus !== "settled";

  if (sendReceipt && customer?.email && setting.customerReceiptEmails) {
    const notification = await createNotificationRecord({
      merchantId: charge.merchantId.toString(),
      environment,
      templateKey: "customer.payment.receipt",
      audience: "customer",
      category: "billing",
      recipient: {
        email: customer.email,
        name: customer.name,
      },
      payload: {
        customerName: customer.name,
        planName: plan?.name ?? "Subscription",
        amount,
        nextChargeAt: subscription.nextChargeAt,
        paidAt: charge.processedAt,
        receiptRef: charge.externalChargeId,
        portalUrl,
      },
      metadata: {
        chargeId: charge._id.toString(),
        subscriptionId: subscription._id.toString(),
      },
      idempotencyKey: createNotificationIdempotencyKey([
        "customer-receipt",
        charge._id.toString(),
        customer.email,
      ]),
    });
    await queueNotificationRecord(notification._id.toString());
    notifications.push(notification);
  }

  const sendFailedNotice =
    input.nextStatus === "failed" && input.previousStatus !== "failed";

  if (sendFailedNotice) {
    if (customer?.email && setting.customerPaymentFollowUps) {
      const customerNotification = await createNotificationRecord({
        merchantId: charge.merchantId.toString(),
        environment,
        templateKey:
          subscription.status === "past_due"
            ? "customer.subscription.past_due"
            : "customer.payment.failed",
        audience: "customer",
        category: "billing",
        recipient: {
          email: customer.email,
          name: customer.name,
        },
        payload: {
          customerName: customer.name,
          planName: plan?.name ?? "Subscription",
          amount,
          retryAt: subscription.retryAvailableAt,
          portalUrl,
        },
        metadata: {
          chargeId: charge._id.toString(),
          subscriptionId: subscription._id.toString(),
        },
        idempotencyKey: createNotificationIdempotencyKey([
          "customer-payment-failed",
          charge._id.toString(),
          customer.email,
        ]),
      });
      await queueNotificationRecord(customerNotification._id.toString());
      notifications.push(customerNotification);
    }

    const shouldAlertMerchant = setting.merchantSubscriptionAlerts;

    if (shouldAlertMerchant) {
      const recipients = await resolveMerchantRecipients({
        merchantId: charge.merchantId.toString(),
        group: "billing",
      });

      for (const recipient of recipients) {
        const merchantNotification = await createNotificationRecord({
          merchantId: charge.merchantId.toString(),
          environment,
          templateKey: "merchant.billing.payment_failed",
          audience: "merchant",
          category: "billing",
          recipient,
          payload: {
            customerName: customer?.name ?? subscription.customerName,
            planName: plan?.name ?? "Subscription",
            amount,
            retryAt: subscription.retryAvailableAt,
            dashboardUrl: getDashboardUrl("/dashboard/payments"),
          },
          metadata: {
            chargeId: charge._id.toString(),
            subscriptionId: subscription._id.toString(),
          },
          idempotencyKey: createNotificationIdempotencyKey([
            "merchant-payment-failed",
            charge._id.toString(),
            recipient.email,
          ]),
        });
        await queueNotificationRecord(merchantNotification._id.toString());
        notifications.push(merchantNotification);
      }
    }
  }

  return notifications;
}

export async function queueVerificationNotification(input: {
  merchantId: string;
  environment: RuntimeMode;
  subjectType: "merchant" | "team_member";
  status: string;
  reviewAnswer?: string | null;
}) {
  const setting = await getOrCreateMerchantSetting(input.merchantId);

  if (!setting.verificationAlerts) {
    return [];
  }

  const templateKey =
    input.subjectType === "merchant"
      ? input.status === "approved"
        ? "merchant.verification.merchant_approved"
        : input.status === "rejected"
          ? "merchant.verification.merchant_rejected"
          : "merchant.verification.merchant_needs_action"
      : input.status === "approved"
        ? "merchant.verification.owner_approved"
        : input.status === "rejected"
          ? "merchant.verification.owner_rejected"
          : "merchant.verification.owner_needs_action";

  const recipients = await resolveMerchantRecipients({
    merchantId: input.merchantId,
    group: "verification",
  });
  const notifications = [];

  for (const recipient of recipients) {
    const notification = await createNotificationRecord({
      merchantId: input.merchantId,
      environment: input.environment,
      templateKey,
      audience: "merchant",
      category: "verification",
      recipient,
      payload: {
        statusLabel: input.reviewAnswer ?? input.status,
        dashboardUrl: getDashboardUrl("/dashboard"),
      },
      metadata: {
        subjectType: input.subjectType,
        status: input.status,
      },
      idempotencyKey: createNotificationIdempotencyKey([
        "verification",
        input.subjectType,
        input.status,
        recipient.email,
        String(Date.now()),
      ]),
    });
    await queueNotificationRecord(notification._id.toString());
    notifications.push(notification);
  }

  return notifications;
}

export async function queueTreasuryApprovalNeededNotification(input: {
  merchantId: string;
  environment: RuntimeMode;
  operationId: string;
}) {
  const [setting, operation] = await Promise.all([
    getOrCreateMerchantSetting(input.merchantId),
    TreasuryOperationModel.findById(input.operationId).exec(),
  ]);

  if (!setting.governanceAlerts || !operation) {
    return [];
  }

  const recipients = await resolveMerchantRecipients({
    merchantId: input.merchantId,
    group: "treasury",
  });
  const notifications = [];

  for (const recipient of recipients) {
    const notification = await createNotificationRecord({
      merchantId: input.merchantId,
      environment: input.environment,
      templateKey: "merchant.treasury.approval_needed",
      audience: "merchant",
      category: "treasury",
      recipient,
      payload: {
        operationLabel: operation.kind.replace(/_/g, " "),
        approvedCount: String(operation.signatures.length),
        threshold: String(operation.threshold),
        dashboardUrl: getDashboardUrl("/dashboard/governance"),
      },
      metadata: {
        operationId: operation._id.toString(),
        kind: operation.kind,
      },
      idempotencyKey: createNotificationIdempotencyKey([
        "treasury-approval-needed",
        operation._id.toString(),
        recipient.email,
      ]),
    });
    await queueNotificationRecord(notification._id.toString());
    notifications.push(notification);
  }

  return notifications;
}

export async function queueTreasuryOperationStatusNotification(input: {
  merchantId: string;
  environment: RuntimeMode;
  operationId: string;
  status: "approved" | "rejected" | "executed";
  reason?: string | null;
}) {
  const [setting, operation] = await Promise.all([
    getOrCreateMerchantSetting(input.merchantId),
    TreasuryOperationModel.findById(input.operationId).exec(),
  ]);

  if (!setting.treasuryAlerts || !operation) {
    return [];
  }

  const templateKey =
    input.status === "approved"
      ? "merchant.treasury.operation_approved"
      : input.status === "rejected"
        ? "merchant.treasury.operation_rejected"
        : "merchant.treasury.operation_executed";
  const recipients = await resolveMerchantRecipients({
    merchantId: input.merchantId,
    group: "treasury",
  });
  const notifications = [];

  for (const recipient of recipients) {
    const notification = await createNotificationRecord({
      merchantId: input.merchantId,
      environment: input.environment,
      templateKey,
      audience: "merchant",
      category: "treasury",
      recipient,
      payload: {
        operationLabel: operation.kind.replace(/_/g, " "),
        threshold: String(operation.threshold),
        reason: input.reason,
        txHash: operation.txHash,
        dashboardUrl: getDashboardUrl("/dashboard/governance"),
      },
      metadata: {
        operationId: operation._id.toString(),
        kind: operation.kind,
        status: input.status,
      },
      idempotencyKey: createNotificationIdempotencyKey([
        "treasury-status",
        input.status,
        operation._id.toString(),
        recipient.email,
      ]),
    });
    await queueNotificationRecord(notification._id.toString());
    notifications.push(notification);
  }

  return notifications;
}

export async function queuePayoutBatchNotification(input: {
  merchantId: string;
  environment: RuntimeMode;
  batchId: string;
  templateKey:
    | "merchant.treasury.payout_batch_opened"
    | "merchant.treasury.payout_completed";
}) {
  const [setting, batch] = await Promise.all([
    getOrCreateMerchantSetting(input.merchantId),
    PayoutBatchModel.findById(input.batchId).exec(),
  ]);

  if (!setting.treasuryAlerts || !batch) {
    return [];
  }

  const recipients = await resolveMerchantRecipients({
    merchantId: input.merchantId,
    group: "treasury",
  });
  const notifications = [];

  for (const recipient of recipients) {
    const notification = await createNotificationRecord({
      merchantId: input.merchantId,
      environment: input.environment,
      templateKey: input.templateKey,
      audience: "merchant",
      category: "treasury",
      recipient,
      payload: {
        batchId: batch._id.toString(),
        netUsdc: `USDC ${batch.netUsdc.toLocaleString()}`,
        settlementCount: String(batch.settlementIds.length),
        txHash: batch.txHash,
        dashboardUrl: getDashboardUrl("/dashboard/treasury"),
      },
      metadata: {
        batchId: batch._id.toString(),
        status: batch.status,
      },
      idempotencyKey: createNotificationIdempotencyKey([
        "payout-batch",
        input.templateKey,
        batch._id.toString(),
        recipient.email,
      ]),
    });
    await queueNotificationRecord(notification._id.toString());
    notifications.push(notification);
  }

  return notifications;
}

export async function queueGovernanceToggleNotification(input: {
  merchantId: string;
  environment: RuntimeMode;
  enabled: boolean;
}) {
  const setting = await getOrCreateMerchantSetting(input.merchantId);

  if (!setting.governanceAlerts) {
    return [];
  }

  const recipients = await resolveMerchantRecipients({
    merchantId: input.merchantId,
    group: "treasury",
  });
  const notifications = [];

  for (const recipient of recipients) {
    const notification = await createNotificationRecord({
      merchantId: input.merchantId,
      environment: input.environment,
      templateKey: input.enabled
        ? "merchant.governance.enabled"
        : "merchant.governance.disabled",
      audience: "merchant",
      category: "treasury",
      recipient,
      payload: {
        dashboardUrl: getDashboardUrl("/dashboard/governance"),
      },
      metadata: {
        enabled: input.enabled,
      },
      idempotencyKey: createNotificationIdempotencyKey([
        "governance-toggle",
        input.enabled ? "enabled" : "disabled",
        recipient.email,
        String(Date.now()),
      ]),
    });
    await queueNotificationRecord(notification._id.toString());
    notifications.push(notification);
  }

  return notifications;
}
