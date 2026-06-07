import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/config/env.config";
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
import { CustomerModel } from "@/features/customers/customer.model";
import {
  resendEmailReceivedWebhookSchema,
  resendWebhookEnvelopeSchema,
} from "@/features/notifications/notification.validation";
import { PaymentModel } from "@/features/payments/payment.model";
import { PaymentIssueModel } from "@/features/payments/payment-issue.model";
import { PayoutModel } from "@/features/payouts/payout.model";
import { getOrCreateMerchantSetting } from "@/features/settings/setting.factory";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";
import { enqueueQueueJob } from "@/shared/workers/queue-runtime";
import { queueNames } from "@/shared/workers/queue-names";

type NotificationRecipient = {
  email: string;
  name: string | null;
};

type ResendReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  html: string | null;
  text: string | null;
  reply_to?: string[];
};

type ResendReceivedAttachment = {
  filename: string;
  content_type?: string | null;
  content_id?: string | null;
  download_url: string;
};

const RESEND_API_BASE_URL = "https://api.resend.com";
const RESEND_USER_AGENT = "renew-server/0.1";
const RESEND_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getAppBaseUrl() {
  return trimTrailingSlash(env.APP_BASE_URL.trim() || "http://localhost:3000");
}

function isResendConfigured() {
  return env.RESEND_API_KEY.trim().length > 0 && env.RESEND_FROM_EMAIL.trim().length > 0;
}

function isResendInboundForwardingConfigured() {
  return (
    env.RESEND_API_KEY.trim().length > 0 &&
    env.RESEND_INBOUND_FORWARD_TO.trim().length > 0 &&
    (env.RESEND_INBOUND_FORWARD_FROM.trim().length > 0 ||
      env.RESEND_REPLY_TO_EMAIL.trim().length > 0 ||
      env.RESEND_FROM_EMAIL.trim().length > 0)
  );
}

function getAppUrl(path: string) {
  return `${getAppBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
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

function resolveMerchantLabel(input: {
  name?: string | null;
  supportEmail?: string | null;
}) {
  return input.name?.trim() || input.supportEmail?.trim() || "Renew workspace";
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function formatMoney(amount: number | null | undefined, currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase() || "USD";
  const normalizedAmount = Number.isFinite(amount) ? Number(amount) : 0;

  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(normalizedAmount);
  } catch {
    return `${normalizedAmount.toLocaleString("en", {
      maximumFractionDigits: 2,
    })} ${normalizedCurrency}`;
  }
}

function formatReleaseDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(value);
}

function shortenValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function formatIssueType(value: string) {
  const labels: Record<string, string> = {
    paid_not_confirmed: "Paid but not confirmed",
    wrong_amount: "Wrong amount",
    duplicate_payment: "Duplicate payment",
    refund_request: "Refund request",
    other: "Other",
  };

  return labels[value] ?? value.replace(/_/g, " ");
}

function formatIssueFiles(
  files?: Array<{ name?: string | null; url?: string | null }> | null
) {
  const fileLabels = (files ?? [])
    .flatMap((file) => {
      const name = readString(file.name) ?? "File";
      const url = readString(file.url);

      return url ? [`${name} (${url})`] : [];
    })
    .slice(0, 4);

  return fileLabels.length > 0 ? fileLabels.join(", ") : null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtmlFromText(value: string) {
  return `<pre style="font:inherit;white-space:pre-wrap;margin:0;">${escapeHtml(value)}</pre>`;
}

function getResendApiHeaders(input?: {
  contentType?: string;
  idempotencyKey?: string;
}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
    "User-Agent": RESEND_USER_AGENT,
  };

  if (input?.contentType) {
    headers["Content-Type"] = input.contentType;
  }

  if (input?.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }

  return headers;
}

async function parseJsonResponse<T>(response: Response) {
  return (await response.json().catch(() => null)) as T | null;
}

function getResendErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  if ("error" in payload) {
    const error = payload.error;

    if (typeof error === "string") {
      return error;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }
  }

  return fallback;
}

async function requestResendJson<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string
) {
  const response = await fetch(`${RESEND_API_BASE_URL}${path}`, init);
  const payload = await parseJsonResponse<T>(response);

  if (!response.ok || !payload) {
    throw new Error(getResendErrorMessage(payload, fallbackMessage));
  }

  return payload;
}

function extractEmailAddress(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/<([^>]+)>/);
  return (match?.[1] ?? normalized).trim();
}

function resolveInboundForwardFromEmail() {
  return (
    env.RESEND_INBOUND_FORWARD_FROM.trim() ||
    (env.RESEND_REPLY_TO_EMAIL.trim()
      ? `Renew <${env.RESEND_REPLY_TO_EMAIL.trim()}>`
      : env.RESEND_FROM_EMAIL.trim())
  );
}

function resolveInboundReplyTo(input: {
  replyTo: string[] | undefined;
  from: string;
}) {
  const explicitReplyTo = input.replyTo?.find((value) => value.trim().length > 0);

  return extractEmailAddress(explicitReplyTo) ?? extractEmailAddress(input.from);
}

function decodeSvixSecret(secret: string) {
  return Buffer.from(secret.replace(/^whsec_/, ""), "base64");
}

function verifyResendWebhookSignature(input: {
  payload: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
}) {
  const webhookSecret = env.RESEND_WEBHOOK_SECRET.trim();

  if (!webhookSecret) {
    return;
  }

  if (!input.svixId || !input.svixTimestamp || !input.svixSignature) {
    throw new HttpError(400, "Missing Resend webhook signature headers.");
  }

  const timestamp = Number.parseInt(input.svixTimestamp, 10);

  if (!Number.isFinite(timestamp)) {
    throw new HttpError(400, "Invalid Resend webhook timestamp.");
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);

  if (Math.abs(currentTimestamp - timestamp) > RESEND_WEBHOOK_TOLERANCE_SECONDS) {
    throw new HttpError(401, "Resend webhook timestamp is outside the allowed window.");
  }

  const signedContent = `${input.svixId}.${input.svixTimestamp}.${input.payload}`;
  const expectedSignature = createHmac("sha256", decodeSvixSecret(webhookSecret))
    .update(signedContent)
    .digest("base64");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const signatures = input.svixSignature
    .split(/\s+/)
    .flatMap((entry) => {
      const [version, signature] = entry.split(",");

      return version === "v1" && signature ? [signature] : [];
    });

  const hasValidSignature = signatures.some((signature) => {
    const providedBuffer = Buffer.from(signature, "utf8");

    return (
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer)
    );
  });

  if (!hasValidSignature) {
    throw new HttpError(401, "Invalid Resend webhook signature.");
  }
}

async function fetchReceivedResendEmail(emailId: string) {
  return requestResendJson<ResendReceivedEmail>(
    `/emails/receiving/${encodeURIComponent(emailId)}`,
    {
      method: "GET",
      headers: getResendApiHeaders(),
    },
    "Failed to fetch the received email from Resend."
  );
}

async function listReceivedResendAttachments(emailId: string) {
  const response = await requestResendJson<{
    data?: ResendReceivedAttachment[];
  }>(
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    {
      method: "GET",
      headers: getResendApiHeaders(),
    },
    "Failed to fetch received email attachments from Resend."
  );

  return response.data ?? [];
}

async function buildForwardedAttachments(emailId: string) {
  const attachments = await listReceivedResendAttachments(emailId);

  if (attachments.length === 0) {
    return undefined;
  }

  return Promise.all(
    attachments.map(async (attachment) => {
      const response = await fetch(attachment.download_url, {
        headers: {
          "User-Agent": RESEND_USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download attachment "${attachment.filename}".`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      return {
        filename: attachment.filename,
        content: buffer.toString("base64"),
        ...(attachment.content_type ? { content_type: attachment.content_type } : {}),
        ...(attachment.content_id ? { content_id: attachment.content_id } : {}),
      };
    })
  );
}

async function forwardReceivedResendEmail(emailId: string) {
  const [email, attachments] = await Promise.all([
    fetchReceivedResendEmail(emailId),
    buildForwardedAttachments(emailId),
  ]);
  const htmlBody =
    email.html?.trim() ||
    (email.text?.trim() ? buildHtmlFromText(email.text.trim()) : undefined);
  const textBody = email.text?.trim() || undefined;
  const replyTo = resolveInboundReplyTo({
    replyTo: email.reply_to,
    from: email.from,
  });
  const response = await requestResendJson<{ id?: string }>(
    "/emails",
    {
      method: "POST",
      headers: getResendApiHeaders({
        contentType: "application/json",
        idempotencyKey: `resend-inbound-forward:${emailId}`,
      }),
      body: JSON.stringify({
        from: resolveInboundForwardFromEmail(),
        to: [env.RESEND_INBOUND_FORWARD_TO.trim()],
        subject: email.subject?.trim() || "(no subject)",
        ...(htmlBody ? { html: htmlBody } : {}),
        ...(textBody ? { text: textBody } : {}),
        ...(attachments?.length ? { attachments } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    },
    "Failed to forward the received email with Resend."
  );

  if (!response.id) {
    throw new Error("Resend did not return a message id for the forwarded email.");
  }

  return {
    providerMessageId: response.id,
    subject: email.subject?.trim() || "(no subject)",
    forwardedTo: env.RESEND_INBOUND_FORWARD_TO.trim(),
  };
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
      merchantName: resolveMerchantLabel({
        name: merchant.name,
        supportEmail: merchant.supportEmail,
      }),
      supportEmail: setting.business.supportEmail,
      brandAccent: setting.business.brandAccent,
      renewLogoUrl: getAppUrl("/renew-logo.png"),
    } satisfies NotificationTemplateBranding,
  };
}

async function resolveMerchantRecipients(input: {
  merchantId: string;
  group: "payment" | "settlement" | "verification" | "developer" | "security";
}) {
  const merchant = await MerchantModel.findById(input.merchantId)
    .select({ supportEmail: 1, ownerName: 1, name: 1 })
    .lean()
    .exec();

  if (!merchant?.supportEmail) {
    return [];
  }

  const recipients = [
    {
      email: merchant.supportEmail,
      name: merchant.ownerName ?? merchant.name ?? null,
    },
  ];

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
  audience: "customer" | "merchant";
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
  const replyToEmail = input.replyToEmail.trim();
  const response = await fetch(`${RESEND_API_BASE_URL}/emails`, {
    method: "POST",
    headers: getResendApiHeaders({
      contentType: "application/json",
      idempotencyKey: input.notificationId,
    }),
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL.trim(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(replyToEmail ? { reply_to: replyToEmail } : {}),
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

export async function handleResendInboundWebhook(input: {
  rawBody: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
}) {
  if (!input.rawBody.trim()) {
    throw new HttpError(400, "Resend webhook payload is empty.");
  }

  verifyResendWebhookSignature({
    payload: input.rawBody,
    svixId: input.svixId,
    svixTimestamp: input.svixTimestamp,
    svixSignature: input.svixSignature,
  });

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(input.rawBody);
  } catch {
    throw new HttpError(400, "Resend webhook payload must be valid JSON.");
  }

  const envelope = resendWebhookEnvelopeSchema.parse(parsedPayload);

  if (envelope.type !== "email.received") {
    return {
      ignored: true,
      type: envelope.type,
    };
  }

  if (!isResendInboundForwardingConfigured()) {
    throw new HttpError(503, "Resend inbound forwarding is not configured.");
  }

  const event = resendEmailReceivedWebhookSchema.parse(envelope);
  const forwarded = await forwardReceivedResendEmail(event.data.email_id);

  return {
    ignored: false,
    type: event.type,
    emailId: event.data.email_id,
    ...forwarded,
  };
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
      replyToEmail: setting.business.supportEmail,
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

export async function queueVerificationNotification(input: {
  merchantId: string;
  environment: RuntimeMode;
  subjectType: "merchant" | "owner";
  status: string;
  reviewAnswer?: string | null;
}) {
  const setting = await getOrCreateMerchantSetting(input.merchantId);

  if (setting.notifications.verificationAlerts === false) {
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
        appUrl: getAppUrl("/overview"),
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

function resolveMoneyMovementNotification(input: {
  previousStatus?: string | null;
  nextStatus: string;
}) {
  const previousWasPaid = ["paid", "settling", "settled"].includes(
    input.previousStatus ?? ""
  );

  if (input.nextStatus === input.previousStatus) {
    return null;
  }

  if (input.nextStatus === "settled" && previousWasPaid) {
    return {
      group: "settlement" as const,
      templateKey: "merchant.settlement.settled" as const,
    };
  }

  if (input.nextStatus === "failed") {
    return previousWasPaid
      ? {
          group: "settlement" as const,
          templateKey: "merchant.settlement.failed" as const,
        }
      : {
          group: "payment" as const,
          templateKey: "merchant.payment.failed" as const,
        };
  }

  if (
    ["paid", "settling", "settled"].includes(input.nextStatus) &&
    !previousWasPaid
  ) {
    return {
      group: "payment" as const,
      templateKey: "merchant.payment.paid" as const,
    };
  }

  return null;
}

export async function queueMoneyMovementNotificationForStatusChange(input: {
  previousStatus?: string | null;
  paymentId: string;
  nextStatus: string;
}) {
  const notification = resolveMoneyMovementNotification(input);

  if (!notification) {
    return [];
  }

  const payment = await PaymentModel.findById(input.paymentId).exec();

  if (!payment) {
    return [];
  }

  const merchantId = payment.merchantId.toString();
  const setting = await getOrCreateMerchantSetting(merchantId);

  if (notification.group === "payment" && setting.notifications.paymentAlerts === false) {
    return [];
  }

  if (
    notification.group === "settlement" &&
    setting.notifications.settlementAlerts === false
  ) {
    return [];
  }

  const payout =
    notification.group === "settlement"
      ? await PayoutModel.findOne({ sourcePaymentId: payment._id })
          .sort({ createdAt: -1 })
          .exec()
      : null;
  const metadata = asRecord(payment.metadata);
  const reference = readString(metadata.reference) ?? payment.payId;
  const settlementAmount =
    payout?.netUsdc ?? payment.collection.stableAmount ?? payment.amount;
  const recipients = await resolveMerchantRecipients({
    merchantId,
    group: notification.group,
  });
  const queuedNotifications = [];

  for (const recipient of recipients) {
    const record = await createNotificationRecord({
      merchantId,
      environment: payment.environment === "live" ? "live" : "test",
      templateKey: notification.templateKey,
      audience: "merchant",
      category: notification.group,
      recipient,
      payload: {
        amountLabel: formatMoney(payment.amount, payment.currency),
        settlementAmountLabel: formatMoney(settlementAmount, "USDC"),
        referenceLabel: reference,
        destinationLabel: shortenValue(payout?.destinationWallet),
        appUrl: getAppUrl(
          notification.group === "settlement"
            ? "/dashboard/settlement"
            : "/dashboard/collections"
        ),
      },
      metadata: {
        paymentId: payment._id.toString(),
        payId: payment.payId,
        payoutId: payout?._id.toString() ?? null,
        previousStatus: input.previousStatus ?? null,
        nextStatus: input.nextStatus,
      },
      idempotencyKey: createNotificationIdempotencyKey([
        notification.templateKey,
        payment._id.toString(),
        recipient.email,
      ]),
    });
    await queueNotificationRecord(record._id.toString());
    queuedNotifications.push(record);
  }

  return queuedNotifications;
}

export async function queueCustomerReceiptForStatusChange(input: {
  previousStatus?: string | null;
  paymentId: string;
  nextStatus: string;
}) {
  const previousWasPaid = ["paid", "settling", "settled"].includes(
    input.previousStatus ?? ""
  );

  if (
    previousWasPaid ||
    !["paid", "settling", "settled"].includes(input.nextStatus)
  ) {
    return [];
  }

  const payment = await PaymentModel.findById(input.paymentId).exec();

  if (!payment?.customerId) {
    return [];
  }

  const customer = await CustomerModel.findById(payment.customerId).exec();

  if (!customer?.email) {
    return [];
  }

  const payout = await PayoutModel.findOne({ sourcePaymentId: payment._id })
    .sort({ createdAt: -1 })
    .exec();
  const metadata = asRecord(payment.metadata);
  const reference = readString(metadata.reference) ?? payment.payId;
  const releaseAt =
    payout?.scheduledFor ??
    new Date(
      (payment.collection.paidAt ?? payment.updatedAt ?? new Date()).getTime() +
        24 * 60 * 60 * 1000
    );
  const record = await createNotificationRecord({
    merchantId: payment.merchantId.toString(),
    environment: payment.environment === "live" ? "live" : "test",
    templateKey: "customer.payment.receipt",
    audience: "customer",
    category: "payment",
    recipient: {
      email: customer.email,
      name: customer.name,
    },
    payload: {
      amountLabel: formatMoney(payment.amount, payment.currency),
      referenceLabel: reference,
      paymentReference: payment.payId,
      releaseAtLabel: formatReleaseDate(releaseAt),
      issueUrl: getAppUrl(`/pay/${payment.payId}/report`),
      appUrl: getAppUrl(`/pay/${payment.payId}`),
    },
    metadata: {
      paymentId: payment._id.toString(),
      payId: payment.payId,
      customerId: customer._id.toString(),
      previousStatus: input.previousStatus ?? null,
      nextStatus: input.nextStatus,
    },
    idempotencyKey: createNotificationIdempotencyKey([
      "customer.payment.receipt",
      payment._id.toString(),
      customer.email,
    ]),
  });

  await queueNotificationRecord(record._id.toString());

  return [record];
}

export async function queuePaymentIssueNotifications(input: {
  issueId: string;
  paymentId: string;
  heldPayoutId?: string | null;
}) {
  const [issue, payment] = await Promise.all([
    PaymentIssueModel.findById(input.issueId).exec(),
    PaymentModel.findById(input.paymentId).exec(),
  ]);

  if (!issue || !payment) {
    return [];
  }

  const metadata = asRecord(payment.metadata);
  const reference = readString(metadata.reference) ?? payment.payId;
  const queuedNotifications = [];

  if (issue.reporterEmail) {
    const record = await createNotificationRecord({
      merchantId: payment.merchantId.toString(),
      environment: payment.environment === "live" ? "live" : "test",
      templateKey: "customer.payment.issue_received",
      audience: "customer",
      category: "payment",
      recipient: {
        email: issue.reporterEmail,
        name: issue.reporterName ?? null,
      },
      payload: {
        referenceLabel: reference,
        appUrl: getAppUrl(`/pay/${payment.payId}`),
      },
      metadata: {
        paymentId: payment._id.toString(),
        payId: payment.payId,
        issueId: issue._id.toString(),
      },
      idempotencyKey: createNotificationIdempotencyKey([
        "customer.payment.issue_received",
        issue._id.toString(),
        issue.reporterEmail,
      ]),
    });
    await queueNotificationRecord(record._id.toString());
    queuedNotifications.push(record);
  }

  const merchantId = payment.merchantId.toString();
  const setting = await getOrCreateMerchantSetting(merchantId);
  const merchantRecipients =
    setting.notifications.paymentAlerts === false
      ? []
      : await resolveMerchantRecipients({
          merchantId,
          group: "payment",
        });
  const adminEmail = readString(env.PAYMENT_ISSUES_ADMIN_EMAIL);
  const recipients = Array.from(
    new Map(
      [
        ...merchantRecipients,
        ...(adminEmail ? [{ email: adminEmail, name: "Renew Ops" }] : []),
      ].map((recipient) => [toLowerEmail(recipient.email), recipient])
    ).values()
  );
  const customerLabel =
    issue.reporterName && issue.reporterEmail
      ? `${issue.reporterName} - ${issue.reporterEmail}`
      : issue.reporterEmail ?? issue.reporterName ?? "Customer not provided";
  const issueFilesLabel = formatIssueFiles(issue.files);

  for (const recipient of recipients) {
    const record = await createNotificationRecord({
      merchantId,
      environment: payment.environment === "live" ? "live" : "test",
      templateKey: "merchant.payment.issue_reported",
      audience: "merchant",
      category: "payment",
      recipient,
      payload: {
        referenceLabel: reference,
        amountLabel: formatMoney(payment.amount, payment.currency),
        issueTypeLabel: formatIssueType(issue.issueType),
        issueDetails: issue.details,
        issueHoldLabel: input.heldPayoutId ? "Payout held" : "Payout not held",
        customerLabel,
        ...(issueFilesLabel ? { issueFilesLabel } : {}),
        appUrl: getAppUrl("/dashboard/collections"),
      },
      metadata: {
        paymentId: payment._id.toString(),
        payId: payment.payId,
        payoutId: input.heldPayoutId ?? null,
        issueId: issue._id.toString(),
      },
      idempotencyKey: createNotificationIdempotencyKey([
        "merchant.payment.issue_reported",
        issue._id.toString(),
        recipient.email,
      ]),
    });
    await queueNotificationRecord(record._id.toString());
    queuedNotifications.push(record);
  }

  return queuedNotifications;
}
