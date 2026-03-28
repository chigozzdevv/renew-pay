type NotificationAudience = "customer" | "merchant" | "team";

export const notificationTemplateKeys = [
  "customer.invoice.issued",
  "customer.invoice.reminder",
  "customer.invoice.paid",
  "customer.subscription.created",
  "customer.subscription.renewal_reminder",
  "customer.payment.receipt",
  "customer.payment.due",
  "customer.payment.failed",
  "customer.subscription.past_due",
  "customer.subscription.cancelled",
  "merchant.invoice.paid",
  "merchant.subscription.created",
  "merchant.billing.payment_digest",
  "merchant.billing.payment_failed",
  "merchant.treasury.approval_needed",
  "merchant.treasury.operation_approved",
  "merchant.treasury.operation_rejected",
  "merchant.treasury.operation_executed",
  "merchant.treasury.payout_batch_opened",
  "merchant.treasury.payout_completed",
  "merchant.verification.owner_needs_action",
  "merchant.verification.owner_approved",
  "merchant.verification.owner_rejected",
  "merchant.verification.merchant_needs_action",
  "merchant.verification.merchant_approved",
  "merchant.verification.merchant_rejected",
  "merchant.governance.enabled",
  "merchant.governance.disabled",
  "team.invite.sent",
  "team.invite.resent",
] as const;

export type NotificationTemplateKey =
  (typeof notificationTemplateKeys)[number];

export const notificationTemplateCatalog: Record<
  NotificationTemplateKey,
  {
    label: string;
    description: string;
    audience: NotificationAudience;
  }
> = {
  "customer.invoice.issued": {
    label: "Customer invoice issued",
    description: "Sent when a one-time invoice is issued and ready for payment.",
    audience: "customer",
  },
  "customer.invoice.reminder": {
    label: "Customer invoice reminder",
    description: "Sent when an outstanding invoice needs follow-up.",
    audience: "customer",
  },
  "customer.invoice.paid": {
    label: "Customer invoice paid",
    description: "Sent after a one-time invoice payment succeeds.",
    audience: "customer",
  },
  "customer.subscription.created": {
    label: "Customer subscription confirmed",
    description: "Sent after a customer starts a subscription or trial.",
    audience: "customer",
  },
  "customer.subscription.renewal_reminder": {
    label: "Customer renewal reminder",
    description: "Sent before the next renewal is due.",
    audience: "customer",
  },
  "customer.payment.receipt": {
    label: "Customer payment receipt",
    description: "Sent after a subscription payment succeeds.",
    audience: "customer",
  },
  "customer.payment.due": {
    label: "Customer payment due",
    description: "Sent when a payment is due and follow-up is needed.",
    audience: "customer",
  },
  "customer.payment.failed": {
    label: "Customer payment failed",
    description: "Sent when a renewal collection fails.",
    audience: "customer",
  },
  "customer.subscription.past_due": {
    label: "Customer subscription past due",
    description: "Sent when retries are exhausted and the subscription needs attention.",
    audience: "customer",
  },
  "customer.subscription.cancelled": {
    label: "Customer subscription cancelled",
    description: "Sent when a subscription is cancelled.",
    audience: "customer",
  },
  "merchant.invoice.paid": {
    label: "Merchant invoice paid alert",
    description: "Sent internally when an invoice is paid successfully.",
    audience: "merchant",
  },
  "merchant.subscription.created": {
    label: "Merchant new subscription alert",
    description: "Sent internally when a new subscription starts.",
    audience: "merchant",
  },
  "merchant.billing.payment_digest": {
    label: "Merchant payment digest",
    description: "Digest summary for successful payments and billing totals.",
    audience: "merchant",
  },
  "merchant.billing.payment_failed": {
    label: "Merchant failed payment alert",
    description: "Sent internally when a subscription charge fails.",
    audience: "merchant",
  },
  "merchant.treasury.approval_needed": {
    label: "Treasury approval needed",
    description: "Sent when a treasury operation needs signatures.",
    audience: "merchant",
  },
  "merchant.treasury.operation_approved": {
    label: "Treasury operation approved",
    description: "Sent when the signature threshold is reached.",
    audience: "merchant",
  },
  "merchant.treasury.operation_rejected": {
    label: "Treasury operation rejected",
    description: "Sent when an operation is rejected.",
    audience: "merchant",
  },
  "merchant.treasury.operation_executed": {
    label: "Treasury operation executed",
    description: "Sent after a treasury action is executed.",
    audience: "merchant",
  },
  "merchant.treasury.payout_batch_opened": {
    label: "Payout batch opened",
    description: "Sent when a payout batch is opened for review or signing.",
    audience: "merchant",
  },
  "merchant.treasury.payout_completed": {
    label: "Payout completed",
    description: "Sent after a payout batch is successfully withdrawn.",
    audience: "merchant",
  },
  "merchant.verification.owner_needs_action": {
    label: "Owner KYC needs action",
    description: "Sent when owner verification requires more information.",
    audience: "merchant",
  },
  "merchant.verification.owner_approved": {
    label: "Owner KYC approved",
    description: "Sent when owner verification is approved.",
    audience: "merchant",
  },
  "merchant.verification.owner_rejected": {
    label: "Owner KYC rejected",
    description: "Sent when owner verification is rejected.",
    audience: "merchant",
  },
  "merchant.verification.merchant_needs_action": {
    label: "Merchant KYB needs action",
    description: "Sent when business verification requires more information.",
    audience: "merchant",
  },
  "merchant.verification.merchant_approved": {
    label: "Merchant KYB approved",
    description: "Sent when business verification is approved.",
    audience: "merchant",
  },
  "merchant.verification.merchant_rejected": {
    label: "Merchant KYB rejected",
    description: "Sent when business verification is rejected.",
    audience: "merchant",
  },
  "merchant.governance.enabled": {
    label: "Governance enabled",
    description: "Sent when workspace governance is enabled.",
    audience: "merchant",
  },
  "merchant.governance.disabled": {
    label: "Governance disabled",
    description: "Sent when workspace governance is disabled.",
    audience: "merchant",
  },
  "team.invite.sent": {
    label: "Team invite sent",
    description: "Sent when a new workspace invite is issued.",
    audience: "team",
  },
  "team.invite.resent": {
    label: "Team invite resent",
    description: "Sent when an outstanding invite is reissued.",
    audience: "team",
  },
};

export type NotificationTemplateBranding = {
  merchantName: string;
  supportEmail: string;
  brandAccent: string;
  emailLogoUrl?: string | null;
};

export type NotificationTemplatePayload = Record<string, unknown>;

export type NotificationTemplateSummaryEntry = {
  label: string;
  value: string;
};

type NotificationTemplateDocument = {
  subject: string;
  eyebrow: string;
  heading: string;
  body: string[];
  cta?: {
    label: string;
    url: string;
  };
  secondaryCta?: {
    label: string;
    url: string;
  };
  summary?: NotificationTemplateSummaryEntry[];
  footerNote?: string;
};

export type RenderedNotificationTemplate = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getAccentColor(value: string) {
  switch (value.trim()) {
    case "dark-green":
      return "#143821";
    case "neutral":
      return "#1f2933";
    default:
      return "#0c4a27";
  }
}

function buildMailto(address: string, subject: string) {
  return `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(subject)}`;
}

function toDateLabel(value: unknown, fallback: string) {
  const date = value instanceof Date ? value : value ? new Date(String(value)) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function buildTemplateDocument(input: {
  templateKey: NotificationTemplateKey;
  branding: NotificationTemplateBranding;
  payload: NotificationTemplatePayload;
}) {
  const { branding, payload } = input;
  const merchantName = branding.merchantName;
  const planName = normalizeValue(payload.planName, "Growth plan");
  const invoiceTitle = normalizeValue(payload.invoiceTitle, "Implementation milestone");
  const invoiceNumber = normalizeValue(payload.invoiceNumber, "RNL-20260328-A1B2C3");
  const amount = normalizeValue(payload.amount, "NGN 120,000");
  const customerName = normalizeValue(payload.customerName, "Amina Yusuf");
  const operationLabel = normalizeValue(payload.operationLabel, "Treasury payout");
  const recipientName = normalizeOptionalValue(payload.recipientName);
  const supportUrl =
    normalizeOptionalValue(payload.supportUrl) ??
    buildMailto(branding.supportEmail, `${merchantName} support`);
  const portalUrl = normalizeOptionalValue(payload.portalUrl) ?? supportUrl;
  const invoiceUrl = normalizeOptionalValue(payload.invoiceUrl) ?? portalUrl;
  const dashboardUrl = normalizeOptionalValue(payload.dashboardUrl) ?? supportUrl;
  const inviteUrl = normalizeOptionalValue(payload.inviteUrl) ?? dashboardUrl;
  const retryAt = toDateLabel(payload.retryAt, "the next retry window");
  const dueDate = toDateLabel(payload.dueDate, "your due date");
  const nextChargeAt = toDateLabel(payload.nextChargeAt, "your next billing date");
  const paidAt = toDateLabel(payload.paidAt, "today");
  const periodLabel = normalizeValue(payload.periodLabel, "Daily");
  const digestMode = normalizeValue(payload.digestMode, "counts");
  const batchId = normalizeValue(payload.batchId, "PB-24A7F1");
  const receiptRef = normalizeValue(payload.receiptRef, "RCT-20381");
  const threshold = normalizeValue(payload.threshold, "2");
  const approvedCount = normalizeValue(payload.approvedCount, "1");
  const txHash = normalizeValue(payload.txHash, "5Yg8...eM7t");
  const reason = normalizeValue(payload.reason, "Review required before execution.");
  const role = normalizeValue(payload.role, "admin");
  const teamName = normalizeValue(payload.teamName, "Ifeoma Okafor");
  const statusLabel = normalizeValue(payload.statusLabel, "approved");
  const summaryCommon = [
    {
      label: "Workspace",
      value: merchantName,
    },
  ];

  switch (input.templateKey) {
    case "customer.invoice.issued":
      return {
        subject: `Invoice ${invoiceNumber} from ${merchantName}`,
        eyebrow: "Invoice issued",
        heading: `Your invoice from ${merchantName} is ready.`,
        body: [
          `${invoiceTitle} has been issued for ${amount}.`,
          `Please complete payment by ${dueDate} using the secure Renew invoice page.`,
        ],
        cta: {
          label: "View invoice",
          url: invoiceUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Invoice",
            value: invoiceNumber,
          },
          {
            label: "Due date",
            value: dueDate,
          },
          {
            label: "Amount",
            value: amount,
          },
        ],
        footerNote: `Questions about this invoice? Contact ${branding.supportEmail}.`,
      } satisfies NotificationTemplateDocument;
    case "customer.invoice.reminder":
      return {
        subject: `Reminder: invoice ${invoiceNumber} is due`,
        eyebrow: "Invoice reminder",
        heading: `Invoice ${invoiceNumber} is still outstanding.`,
        body: [
          `${invoiceTitle} is still awaiting payment.`,
          `Please complete the payment by ${dueDate} or contact support if you need help.`,
        ],
        cta: {
          label: "Open invoice",
          url: invoiceUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Invoice",
            value: invoiceNumber,
          },
          {
            label: "Due date",
            value: dueDate,
          },
          {
            label: "Amount",
            value: amount,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "customer.invoice.paid":
      return {
        subject: `Payment received for invoice ${invoiceNumber}`,
        eyebrow: "Invoice paid",
        heading: `We received your invoice payment.`,
        body: [
          `${amount} was received for ${invoiceTitle} on ${paidAt}.`,
          "Thanks for completing this payment through Renew.",
        ],
        cta: {
          label: "Open invoice",
          url: invoiceUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Invoice",
            value: invoiceNumber,
          },
          {
            label: "Paid",
            value: paidAt,
          },
          {
            label: "Amount",
            value: amount,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "customer.subscription.created":
      return {
        subject: `Your ${merchantName} subscription is active`,
        eyebrow: "Subscription confirmed",
        heading: `You're set up on ${merchantName}.`,
        body: [
          `Your subscription to ${planName} is now active.`,
          `We'll bill ${amount} on ${nextChargeAt} and send you a receipt after every successful payment.`,
        ],
        cta: {
          label: "Manage billing",
          url: portalUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Plan",
            value: planName,
          },
          {
            label: "Next charge",
            value: nextChargeAt,
          },
          {
            label: "Amount",
            value: amount,
          },
        ],
        footerNote: `Need help? Reply to this email or contact ${branding.supportEmail}.`,
      } satisfies NotificationTemplateDocument;
    case "customer.subscription.renewal_reminder":
      return {
        subject: `${merchantName} renewal reminder`,
        eyebrow: "Renewal reminder",
        heading: `Your ${planName} renewal is coming up.`,
        body: [
          `We'll attempt to collect ${amount} on ${nextChargeAt}.`,
          "If your billing details have changed, update them before the renewal date to avoid interruptions.",
        ],
        cta: {
          label: "Review billing",
          url: portalUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Plan",
            value: planName,
          },
          {
            label: "Renewal date",
            value: nextChargeAt,
          },
          {
            label: "Amount",
            value: amount,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "customer.payment.receipt":
      return {
        subject: `Payment received for ${merchantName}`,
        eyebrow: "Payment receipt",
        heading: `We received your payment.`,
        body: [
          `${amount} was collected successfully for ${planName} on ${paidAt}.`,
          `Your next renewal is scheduled for ${nextChargeAt}.`,
        ],
        cta: {
          label: "View billing",
          url: portalUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Receipt",
            value: receiptRef,
          },
          {
            label: "Paid",
            value: paidAt,
          },
          {
            label: "Next renewal",
            value: nextChargeAt,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "customer.payment.due":
      return {
        subject: `Payment due for your ${merchantName} subscription`,
        eyebrow: "Payment due",
        heading: `A payment is due on ${dueDate}.`,
        body: [
          `${amount} is due for your ${planName} subscription.`,
          "Please follow up before the due date to keep your billing active without interruption.",
        ],
        cta: {
          label: "Review billing",
          url: portalUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Plan",
            value: planName,
          },
          {
            label: "Due date",
            value: dueDate,
          },
          {
            label: "Amount",
            value: amount,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "customer.payment.failed":
      return {
        subject: `We couldn't process your ${merchantName} payment`,
        eyebrow: "Payment failed",
        heading: `Your renewal payment didn't go through.`,
        body: [
          `We couldn't collect ${amount} for ${planName}.`,
          `We'll try again around ${retryAt}. You can also review your billing details or contact support now.`,
        ],
        cta: {
          label: "Review billing",
          url: portalUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Plan",
            value: planName,
          },
          {
            label: "Amount",
            value: amount,
          },
          {
            label: "Next retry",
            value: retryAt,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "customer.subscription.past_due":
      return {
        subject: `Your ${merchantName} subscription is past due`,
        eyebrow: "Past due",
        heading: `Your subscription needs attention.`,
        body: [
          `Recent attempts to collect ${amount} for ${planName} were unsuccessful.`,
          "Please follow up as soon as possible to avoid interruption.",
        ],
        cta: {
          label: "Review billing",
          url: portalUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Plan",
            value: planName,
          },
          {
            label: "Status",
            value: "Past due",
          },
          {
            label: "Amount",
            value: amount,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "customer.subscription.cancelled":
      return {
        subject: `Your ${merchantName} subscription was cancelled`,
        eyebrow: "Subscription cancelled",
        heading: `Your billing has been stopped.`,
        body: [
          `Your ${planName} subscription was cancelled on ${paidAt}.`,
          "If you think this was a mistake, contact support and we'll help you review the account.",
        ],
        cta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Plan",
            value: planName,
          },
          {
            label: "Cancelled",
            value: paidAt,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.invoice.paid":
      return {
        subject: `Invoice paid: ${invoiceNumber}`,
        eyebrow: "Billing alert",
        heading: `${customerName} paid an invoice.`,
        body: [
          `${amount} was received for ${invoiceTitle} on ${paidAt}.`,
          "Renew has moved the invoice through collection and settlement tracking.",
        ],
        cta: {
          label: "Open invoices",
          url: dashboardUrl,
        },
        summary: [
          ...summaryCommon,
          {
            label: "Invoice",
            value: invoiceNumber,
          },
          {
            label: "Customer",
            value: customerName,
          },
          {
            label: "Amount",
            value: amount,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.subscription.created":
      return {
        subject: `New subscription: ${customerName}`,
        eyebrow: "Merchant alert",
        heading: `${customerName} started a subscription.`,
        body: [
          `${customerName} is now active on ${planName}.`,
          "Use this alert to confirm onboarding and keep the account owner loop informed.",
        ],
        cta: {
          label: "Open subscriptions",
          url: dashboardUrl,
        },
        summary: [
          ...summaryCommon,
          {
            label: "Customer",
            value: customerName,
          },
          {
            label: "Plan",
            value: planName,
          },
          {
            label: "Amount",
            value: amount,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.billing.payment_digest":
      return {
        subject: `${periodLabel} billing summary for ${merchantName}`,
        eyebrow: "Billing digest",
        heading: `${periodLabel} billing summary`,
        body: [
          normalizeValue(
            payload.digestIntro,
            digestMode === "detailed"
              ? "Successful payments, failed charges, and collections are grouped below for finance review."
              : "Successful payments and failed charges have been summarized for finance review."
          ),
        ],
        cta: {
          label: "Open payments",
          url: dashboardUrl,
        },
        summary: [
          ...summaryCommon,
          {
            label: "Successful payments",
            value: normalizeValue(payload.successfulPayments, "18"),
          },
          {
            label: "Failed payments",
            value: normalizeValue(payload.failedPayments, "2"),
          },
          {
            label: "Net collected",
            value: normalizeValue(payload.netCollected, "USDC 8,421.22"),
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.billing.payment_failed":
      return {
        subject: `Payment failed for ${customerName}`,
        eyebrow: "Billing alert",
        heading: `${customerName} could not be charged.`,
        body: [
          `The latest attempt to collect ${amount} for ${planName} failed.`,
          `The next retry window opens around ${retryAt}. Consider following up if the account is sensitive or high value.`,
        ],
        cta: {
          label: "Open payments",
          url: dashboardUrl,
        },
        summary: [
          ...summaryCommon,
          {
            label: "Customer",
            value: customerName,
          },
          {
            label: "Amount",
            value: amount,
          },
          {
            label: "Next retry",
            value: retryAt,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.treasury.approval_needed":
      return {
        subject: `Approval needed: ${operationLabel}`,
        eyebrow: "Treasury approval",
        heading: `${operationLabel} needs signatures.`,
        body: [
          `A protected treasury action is waiting for approval in ${merchantName}.`,
          `${approvedCount} of ${threshold} required approvals have been received so far.`,
        ],
        cta: {
          label: "Open governance",
          url: dashboardUrl,
        },
        summary: [
          ...summaryCommon,
          {
            label: "Operation",
            value: operationLabel,
          },
          {
            label: "Approvals",
            value: `${approvedCount} / ${threshold}`,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.treasury.operation_approved":
      return {
        subject: `Operation approved: ${operationLabel}`,
        eyebrow: "Treasury update",
        heading: `${operationLabel} is ready to execute.`,
        body: [
          `The required signature threshold has been reached for ${operationLabel}.`,
          "You can move forward with execution when operations are ready.",
        ],
        cta: {
          label: "Review operation",
          url: dashboardUrl,
        },
        summary: [
          ...summaryCommon,
          {
            label: "Operation",
            value: operationLabel,
          },
          {
            label: "Threshold",
            value: `${threshold} approvals reached`,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.treasury.operation_rejected":
      return {
        subject: `Operation rejected: ${operationLabel}`,
        eyebrow: "Treasury update",
        heading: `${operationLabel} was rejected.`,
        body: [
          "The operation has been rejected and will not proceed in its current form.",
          `Reason: ${reason}`,
        ],
        cta: {
          label: "Open governance",
          url: dashboardUrl,
        },
        summary: [
          ...summaryCommon,
          {
            label: "Operation",
            value: operationLabel,
          },
          {
            label: "Reason",
            value: reason,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.treasury.operation_executed":
      return {
        subject: `Operation executed: ${operationLabel}`,
        eyebrow: "Treasury update",
        heading: `${operationLabel} was executed.`,
        body: [
          `The protected action completed successfully for ${merchantName}.`,
          `Transaction reference: ${txHash}`,
        ],
        cta: {
          label: "Open governance",
          url: dashboardUrl,
        },
        summary: [
          ...summaryCommon,
          {
            label: "Operation",
            value: operationLabel,
          },
          {
            label: "Transaction",
            value: txHash,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.treasury.payout_batch_opened":
      return {
        subject: `Payout batch opened: ${batchId}`,
        eyebrow: "Treasury payout",
        heading: `Batch ${batchId} is ready for review.`,
        body: [
          "A payout batch was opened and is now waiting for review, approval, or execution.",
          "Use the treasury workspace to confirm the final payout path and timing.",
        ],
        cta: {
          label: "Open treasury",
          url: dashboardUrl,
        },
        summary: [
          ...summaryCommon,
          {
            label: "Batch",
            value: batchId,
          },
          {
            label: "Net payout",
            value: normalizeValue(payload.netUsdc, "USDC 6,280.41"),
          },
          {
            label: "Settlements",
            value: normalizeValue(payload.settlementCount, "12"),
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.treasury.payout_completed":
      return {
        subject: `Payout completed: ${batchId}`,
        eyebrow: "Treasury payout",
        heading: `Batch ${batchId} was completed.`,
        body: [
          `The payout batch completed successfully. Transaction reference: ${txHash}.`,
          "Treasury balances and settlement history are now updated in Renew.",
        ],
        cta: {
          label: "Open treasury",
          url: dashboardUrl,
        },
        summary: [
          ...summaryCommon,
          {
            label: "Batch",
            value: batchId,
          },
          {
            label: "Transaction",
            value: txHash,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.owner_needs_action":
      return {
        subject: `Owner KYC needs action for ${merchantName}`,
        eyebrow: "Verification",
        heading: "Owner verification needs more information.",
        body: [
          "The verification provider asked for additional details before owner KYC can be approved.",
          "Open onboarding to review the latest requirement and continue.",
        ],
        cta: {
          label: "Open onboarding",
          url: dashboardUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.owner_approved":
      return {
        subject: `Owner KYC approved for ${merchantName}`,
        eyebrow: "Verification",
        heading: "Owner verification is approved.",
        body: [
          "Owner KYC completed successfully.",
          "If live operations are still blocked, review the remaining onboarding steps.",
        ],
        cta: {
          label: "Open onboarding",
          url: dashboardUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.owner_rejected":
      return {
        subject: `Owner KYC rejected for ${merchantName}`,
        eyebrow: "Verification",
        heading: "Owner verification was rejected.",
        body: [
          `Status received: ${statusLabel}.`,
          "Review the provider notes and submit a corrected verification package.",
        ],
        cta: {
          label: "Open onboarding",
          url: dashboardUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.merchant_needs_action":
      return {
        subject: `Business verification needs action for ${merchantName}`,
        eyebrow: "Verification",
        heading: "Business verification needs more information.",
        body: [
          "Merchant KYB requires additional documents or clarification.",
          "Open onboarding to review the latest verification request.",
        ],
        cta: {
          label: "Open onboarding",
          url: dashboardUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.merchant_approved":
      return {
        subject: `Business verification approved for ${merchantName}`,
        eyebrow: "Verification",
        heading: "Business verification is approved.",
        body: [
          "Merchant KYB completed successfully.",
          "You can continue live onboarding and treasury setup from the dashboard.",
        ],
        cta: {
          label: "Open onboarding",
          url: dashboardUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.merchant_rejected":
      return {
        subject: `Business verification rejected for ${merchantName}`,
        eyebrow: "Verification",
        heading: "Business verification was rejected.",
        body: [
          `Status received: ${statusLabel}.`,
          "Review the provider response and prepare a corrected submission.",
        ],
        cta: {
          label: "Open onboarding",
          url: dashboardUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.governance.enabled":
      return {
        subject: `Governance enabled for ${merchantName}`,
        eyebrow: "Governance",
        heading: "Advanced governance controls are now active.",
        body: [
          "Protected treasury actions will now follow the governance flow for review and signing.",
        ],
        cta: {
          label: "Open governance",
          url: dashboardUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.governance.disabled":
      return {
        subject: `Governance disabled for ${merchantName}`,
        eyebrow: "Governance",
        heading: "Advanced governance controls were turned off.",
        body: [
          "Treasury changes will now follow the single-owner flow until governance is enabled again.",
        ],
        cta: {
          label: "Open governance",
          url: dashboardUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "team.invite.sent":
      return {
        subject: `You've been invited to ${merchantName}`,
        eyebrow: "Workspace invite",
        heading: `${recipientName ?? teamName}, you're invited to join ${merchantName}.`,
        body: [
          `You've been invited to Renew as ${role}.`,
          "Use the secure link below to continue with access setup and then sign in to the workspace.",
        ],
        cta: {
          label: "Open Renew",
          url: inviteUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Workspace",
            value: merchantName,
          },
          {
            label: "Role",
            value: role,
          },
        ],
      } satisfies NotificationTemplateDocument;
    case "team.invite.resent":
      return {
        subject: `Reminder: your ${merchantName} invite`,
        eyebrow: "Workspace invite",
        heading: "Your workspace invite was reissued.",
        body: [
          `The invitation to join ${merchantName} has been sent again.`,
          "Use the secure link below to continue with access setup.",
        ],
        cta: {
          label: "Open Renew",
          url: inviteUrl,
        },
        secondaryCta: {
          label: "Contact support",
          url: supportUrl,
        },
        summary: [
          {
            label: "Workspace",
            value: merchantName,
          },
          {
            label: "Role",
            value: role,
          },
        ],
      } satisfies NotificationTemplateDocument;
  }

  const exhaustiveTemplateKey: never = input.templateKey;
  throw new Error(`Unhandled notification template: ${exhaustiveTemplateKey}`);
}

function renderText(input: {
  branding: NotificationTemplateBranding;
  document: NotificationTemplateDocument;
}) {
  const summaryLines = input.document.summary?.length
    ? [
        "",
        ...input.document.summary.map((entry) => `${entry.label}: ${entry.value}`),
      ]
    : [];

  return [
    input.document.subject,
    "",
    input.document.heading,
    "",
    ...input.document.body,
    ...summaryLines,
    ...(input.document.cta
      ? ["", `${input.document.cta.label}: ${input.document.cta.url}`]
      : []),
    ...(input.document.secondaryCta
      ? [`${input.document.secondaryCta.label}: ${input.document.secondaryCta.url}`]
      : []),
    "",
    input.document.footerNote ??
      `Questions? Contact ${input.branding.supportEmail}.`,
  ].join("\n");
}

function renderHtml(input: {
  branding: NotificationTemplateBranding;
  document: NotificationTemplateDocument;
}) {
  const accent = getAccentColor(input.branding.brandAccent);
  const summaryHtml = input.document.summary?.length
    ? `
      <div style="margin-top:24px;border:1px solid #d9e4d7;border-radius:18px;background:#f7fbf5;padding:18px 20px;">
        ${input.document.summary
          .map(
            (entry) => `
              <div style="padding:${escapeHtml(entry.label === input.document.summary?.[0]?.label ? "0" : "12px 0 0")}">
                <div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5f6c63;">
                  ${escapeHtml(entry.label)}
                </div>
                <div style="margin-top:4px;font-size:15px;line-height:22px;font-weight:600;color:#18231d;">
                  ${escapeHtml(entry.value)}
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `
    : "";

  const ctaHtml = input.document.cta
    ? `
      <a href="${escapeHtml(input.document.cta.url)}" style="display:inline-block;margin-top:28px;padding:13px 18px;border-radius:999px;background:${accent};color:#f2f8ed;text-decoration:none;font-size:14px;line-height:20px;font-weight:700;">
        ${escapeHtml(input.document.cta.label)}
      </a>
    `
    : "";

  const secondaryHtml = input.document.secondaryCta
    ? `
      <div style="margin-top:14px;">
        <a href="${escapeHtml(input.document.secondaryCta.url)}" style="color:${accent};text-decoration:none;font-size:14px;line-height:20px;font-weight:600;">
          ${escapeHtml(input.document.secondaryCta.label)}
        </a>
      </div>
    `
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.document.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef3ed;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18231d;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef3ed;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;">
            <tr>
              <td style="padding-bottom:14px;">
                <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#5f6c63;">
                  ${escapeHtml(input.document.eyebrow)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="border:1px solid #dbe6d7;border-radius:28px;background:#ffffff;padding:28px 28px 24px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
                  <div>
                    <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${accent};">
                      ${escapeHtml(input.branding.merchantName)}
                    </div>
                    <div style="margin-top:8px;font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.03em;color:#122017;">
                      ${escapeHtml(input.document.heading)}
                    </div>
                  </div>
                  ${
                    input.branding.emailLogoUrl
                      ? `<img src="${escapeHtml(input.branding.emailLogoUrl)}" alt="${escapeHtml(
                          input.branding.merchantName
                        )}" style="display:block;max-height:44px;max-width:160px;border:0;" />`
                      : ""
                  }
                </div>
                <div style="margin-top:20px;font-size:15px;line-height:25px;color:#314339;">
                  ${input.document.body
                    .map(
                      (paragraph) => `<p style="margin:0 0 14px;">${escapeHtml(paragraph)}</p>`
                    )
                    .join("")}
                </div>
                ${summaryHtml}
                ${ctaHtml}
                ${secondaryHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 8px 0;">
                <div style="font-size:12px;line-height:20px;color:#5f6c63;">
                  ${escapeHtml(
                    input.document.footerNote ??
                      `Questions? Contact ${input.branding.supportEmail}.`
                  )}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderNotificationTemplate(input: {
  templateKey: NotificationTemplateKey;
  branding: NotificationTemplateBranding;
  payload: NotificationTemplatePayload;
}): RenderedNotificationTemplate {
  const document = buildTemplateDocument(input);

  return {
    subject: document.subject,
    html: renderHtml({
      branding: input.branding,
      document,
    }),
    text: renderText({
      branding: input.branding,
      document,
    }),
  };
}

export function buildNotificationTemplatePreviewPayload(
  templateKey: NotificationTemplateKey
): NotificationTemplatePayload {
  switch (templateKey) {
    case "customer.invoice.issued":
      return {
        invoiceTitle: "Implementation milestone",
        invoiceNumber: "RNL-20260328-A1B2C3",
        amount: "NGN 120,000",
        dueDate: "2026-04-25T09:00:00.000Z",
        invoiceUrl: "https://app.renew.sh/invoices/inv_demo_123",
      };
    case "customer.invoice.reminder":
      return {
        invoiceTitle: "Implementation milestone",
        invoiceNumber: "RNL-20260328-A1B2C3",
        amount: "NGN 120,000",
        dueDate: "2026-04-25T09:00:00.000Z",
        invoiceUrl: "https://app.renew.sh/invoices/inv_demo_123",
      };
    case "customer.invoice.paid":
      return {
        invoiceTitle: "Implementation milestone",
        invoiceNumber: "RNL-20260328-A1B2C3",
        amount: "NGN 120,000",
        paidAt: "2026-03-25T11:20:00.000Z",
        invoiceUrl: "https://app.renew.sh/invoices/inv_demo_123",
      };
    case "customer.subscription.created":
      return {
        planName: "Growth",
        amount: "NGN 120,000",
        nextChargeAt: "2026-04-25T09:00:00.000Z",
        portalUrl: "https://app.renew.sh",
      };
    case "customer.subscription.renewal_reminder":
      return {
        planName: "Growth",
        amount: "NGN 120,000",
        nextChargeAt: "2026-04-25T09:00:00.000Z",
        portalUrl: "https://app.renew.sh",
      };
    case "customer.payment.receipt":
      return {
        planName: "Growth",
        amount: "NGN 120,000",
        nextChargeAt: "2026-05-25T09:00:00.000Z",
        paidAt: "2026-03-25T11:20:00.000Z",
        receiptRef: "RCT-20381",
        portalUrl: "https://app.renew.sh",
      };
    case "customer.payment.due":
      return {
        planName: "Growth",
        amount: "NGN 120,000",
        dueDate: "2026-04-25T09:00:00.000Z",
        portalUrl: "https://app.renew.sh",
      };
    case "customer.payment.failed":
      return {
        planName: "Growth",
        amount: "NGN 120,000",
        retryAt: "2026-03-27T09:00:00.000Z",
        portalUrl: "https://app.renew.sh",
      };
    case "customer.subscription.past_due":
      return {
        planName: "Growth",
        amount: "NGN 120,000",
        portalUrl: "https://app.renew.sh",
      };
    case "customer.subscription.cancelled":
      return {
        planName: "Growth",
        paidAt: "2026-03-25T11:20:00.000Z",
      };
    case "merchant.invoice.paid":
      return {
        invoiceTitle: "Implementation milestone",
        invoiceNumber: "RNL-20260328-A1B2C3",
        customerName: "Amina Yusuf",
        amount: "NGN 120,000",
        paidAt: "2026-03-25T11:20:00.000Z",
        dashboardUrl: "https://app.renew.sh/dashboard/invoices",
      };
    case "merchant.subscription.created":
      return {
        customerName: "Amina Yusuf",
        planName: "Growth",
        amount: "NGN 120,000",
        dashboardUrl: "https://app.renew.sh/dashboard/subscriptions",
      };
    case "merchant.billing.payment_digest":
      return {
        periodLabel: "Daily",
        successfulPayments: "18",
        failedPayments: "2",
        netCollected: "USDC 8,421.22",
        digestMode: "detailed",
        dashboardUrl: "https://app.renew.sh/dashboard/payments",
      };
    case "merchant.billing.payment_failed":
      return {
        customerName: "Amina Yusuf",
        planName: "Growth",
        amount: "NGN 120,000",
        retryAt: "2026-03-27T09:00:00.000Z",
        dashboardUrl: "https://app.renew.sh/dashboard/payments",
      };
    case "merchant.treasury.approval_needed":
      return {
        operationLabel: "Payout wallet change",
        approvedCount: "1",
        threshold: "2",
        dashboardUrl: "https://app.renew.sh/dashboard/governance",
      };
    case "merchant.treasury.operation_approved":
      return {
        operationLabel: "Payout wallet change",
        threshold: "2",
        dashboardUrl: "https://app.renew.sh/dashboard/governance",
      };
    case "merchant.treasury.operation_rejected":
      return {
        operationLabel: "Settlement sweep",
        reason: "Incorrect destination wallet selected.",
        dashboardUrl: "https://app.renew.sh/dashboard/governance",
      };
    case "merchant.treasury.operation_executed":
      return {
        operationLabel: "Settlement sweep",
        txHash: "5Yg8...eM7t",
        dashboardUrl: "https://app.renew.sh/dashboard/governance",
      };
    case "merchant.treasury.payout_batch_opened":
      return {
        batchId: "PB-24A7F1",
        netUsdc: "USDC 6,280.41",
        settlementCount: "12",
        dashboardUrl: "https://app.renew.sh/dashboard/treasury",
      };
    case "merchant.treasury.payout_completed":
      return {
        batchId: "PB-24A7F1",
        txHash: "5Yg8...eM7t",
        dashboardUrl: "https://app.renew.sh/dashboard/treasury",
      };
    case "merchant.verification.owner_needs_action":
    case "merchant.verification.owner_approved":
    case "merchant.verification.owner_rejected":
    case "merchant.verification.merchant_needs_action":
    case "merchant.verification.merchant_approved":
    case "merchant.verification.merchant_rejected":
      return {
        statusLabel: "rejected",
        dashboardUrl: "https://app.renew.sh/dashboard",
      };
    case "merchant.governance.enabled":
    case "merchant.governance.disabled":
      return {
        dashboardUrl: "https://app.renew.sh/dashboard/governance",
      };
    case "team.invite.sent":
    case "team.invite.resent":
      return {
        recipientName: "Ifeoma Okafor",
        role: "finance",
        inviteUrl: "https://app.renew.sh/login",
      };
  }

  const exhaustiveTemplateKey: never = templateKey;
  throw new Error(`Unhandled preview template: ${exhaustiveTemplateKey}`);
}
