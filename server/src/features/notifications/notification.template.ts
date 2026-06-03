type NotificationAudience = "customer" | "merchant";

export const notificationTemplateKeys = [
  "customer.payment.receipt",
  "customer.payment.issue_received",
  "merchant.payment.paid",
  "merchant.payment.failed",
  "merchant.settlement.scheduled",
  "merchant.settlement.held",
  "merchant.settlement.settled",
  "merchant.settlement.failed",
  "merchant.verification.owner_needs_action",
  "merchant.verification.owner_approved",
  "merchant.verification.owner_rejected",
  "merchant.verification.merchant_needs_action",
  "merchant.verification.merchant_approved",
  "merchant.verification.merchant_rejected",
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
  "customer.payment.receipt": {
    label: "Customer receipt",
    description: "Sent when a customer payment is confirmed.",
    audience: "customer",
  },
  "customer.payment.issue_received": {
    label: "Issue received",
    description: "Sent when a customer reports a payment issue.",
    audience: "customer",
  },
  "merchant.payment.paid": {
    label: "Payment received",
    description: "Sent when a customer payment is confirmed.",
    audience: "merchant",
  },
  "merchant.payment.failed": {
    label: "Payment failed",
    description: "Sent when a customer payment fails.",
    audience: "merchant",
  },
  "merchant.settlement.scheduled": {
    label: "Settlement scheduled",
    description: "Sent when settlement is scheduled for release.",
    audience: "merchant",
  },
  "merchant.settlement.held": {
    label: "Settlement held",
    description: "Sent when a reported issue holds settlement.",
    audience: "merchant",
  },
  "merchant.settlement.settled": {
    label: "Settlement completed",
    description: "Sent when settled value reaches the destination.",
    audience: "merchant",
  },
  "merchant.settlement.failed": {
    label: "Settlement failed",
    description: "Sent when settlement cannot be completed.",
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
};

export type NotificationTemplateBranding = {
  merchantName: string;
  supportEmail: string;
  brandAccent: string;
  emailLogoUrl?: string | null;
};

export type NotificationTemplatePayload = Record<string, unknown>;

type NotificationTemplateDocument = {
  subject: string;
  eyebrow: string;
  heading: string;
  body: string[];
  cta?: {
    label: string;
    url: string;
  };
};

function normalizeValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildMailto(email: string, subject: string) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTemplateDocument(input: {
  templateKey: NotificationTemplateKey;
  branding: NotificationTemplateBranding;
  payload: NotificationTemplatePayload;
}) {
  const { branding, payload } = input;
  const merchantName = branding.merchantName;
  const appUrl =
    normalizeOptionalValue(payload.appUrl) ??
    buildMailto(branding.supportEmail, `${merchantName} support`);
  const statusLabel = normalizeValue(payload.statusLabel, "pending");
  const amountLabel = normalizeValue(payload.amountLabel, "the payment");
  const referenceLabel = normalizeValue(payload.referenceLabel, "the collection");
  const paymentReference = normalizeValue(payload.paymentReference, referenceLabel);
  const releaseAtLabel = normalizeValue(payload.releaseAtLabel, "the next release window");
  const settlementAmountLabel = normalizeValue(
    payload.settlementAmountLabel,
    "the settlement"
  );
  const destinationLabel = normalizeOptionalValue(payload.destinationLabel);
  const issueUrl =
    normalizeOptionalValue(payload.issueUrl) ??
    buildMailto(branding.supportEmail, `Payment issue: ${paymentReference}`);

  switch (input.templateKey) {
    case "customer.payment.receipt":
      return {
        subject: `Your payment to ${merchantName} was successful`,
        eyebrow: "Payment successful",
        heading: "Payment received.",
        body: [
          `${amountLabel} was paid to ${merchantName} for ${referenceLabel}.`,
          `Payment reference: ${paymentReference}.`,
          `If something looks wrong, report it before settlement is released on ${releaseAtLabel}.`,
        ],
        cta: {
          label: "Report an issue",
          url: issueUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "customer.payment.issue_received":
      return {
        subject: "We received your payment report",
        eyebrow: "Issue reported",
        heading: "We are reviewing your report.",
        body: [
          `We received your report for ${referenceLabel}.`,
          "Settlement for this payment is held while Renew reviews the issue.",
          "We will email you when there is an update.",
        ],
        cta: {
          label: "View payment",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.payment.paid":
      return {
        subject: `Payment received for ${referenceLabel}`,
        eyebrow: "Payment received",
        heading: "Payment received.",
        body: [
          `${amountLabel} was collected for ${referenceLabel}.`,
          `Settlement is scheduled for ${releaseAtLabel}.`,
        ],
        cta: {
          label: "Open collections",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.payment.failed":
      return {
        subject: `${merchantName} payment failed`,
        eyebrow: "Payment failed",
        heading: "Payment could not be completed.",
        body: [
          `${amountLabel} could not be collected for ${referenceLabel}.`,
          "Open collections to review the latest status.",
        ],
        cta: {
          label: "Open collections",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.settlement.scheduled":
      return {
        subject: `Settlement scheduled for ${referenceLabel}`,
        eyebrow: "Settlement scheduled",
        heading: "Settlement scheduled.",
        body: [
          `${settlementAmountLabel} is scheduled for release on ${releaseAtLabel}.`,
          ...(destinationLabel ? [`Destination: ${destinationLabel}.`] : []),
        ],
        cta: {
          label: "Open payouts",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.settlement.held":
      return {
        subject: `Settlement held for ${referenceLabel}`,
        eyebrow: "Settlement held",
        heading: "Settlement is held for review.",
        body: [
          `Settlement for ${referenceLabel} is held because a payment issue was reported before release.`,
          "Renew will review the report and update the payout status.",
        ],
        cta: {
          label: "Open payouts",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.settlement.settled":
      return {
        subject: `Stellar settlement released for ${referenceLabel}`,
        eyebrow: "Settlement released",
        heading: "Settlement released.",
        body: [
          `${settlementAmountLabel} was released to your Stellar wallet.`,
          ...(destinationLabel ? [`Destination: ${destinationLabel}.`] : []),
        ],
        cta: {
          label: "Open payouts",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.settlement.failed":
      return {
        subject: `Settlement failed for ${referenceLabel}`,
        eyebrow: "Settlement failed",
        heading: "Settlement could not be completed.",
        body: [
          `${settlementAmountLabel} could not settle for ${referenceLabel}.`,
          "Open payouts to review the latest status.",
        ],
        cta: {
          label: "Open payouts",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.owner_needs_action":
      return {
        subject: `${merchantName} owner verification needs action`,
        eyebrow: "Verification update",
        heading: "Owner verification needs attention.",
        body: [
          `Status received: ${statusLabel}.`,
          "Open onboarding to review the latest verification state.",
        ],
        cta: {
          label: "Open onboarding",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.owner_approved":
      return {
        subject: `${merchantName} owner verification approved`,
        eyebrow: "Verification approved",
        heading: "Owner verification is approved.",
        body: [
          "The account owner has passed verification.",
          "You can continue with the next onboarding step.",
        ],
        cta: {
          label: "Open onboarding",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.owner_rejected":
      return {
        subject: `${merchantName} owner verification rejected`,
        eyebrow: "Verification rejected",
        heading: "Owner verification was rejected.",
        body: [
          `Status received: ${statusLabel}.`,
          "Review the provider response and prepare a corrected submission.",
        ],
        cta: {
          label: "Open onboarding",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.merchant_needs_action":
      return {
        subject: `${merchantName} business verification needs action`,
        eyebrow: "Business verification",
        heading: "Business verification needs attention.",
        body: [
          `Status received: ${statusLabel}.`,
          "Open onboarding to review the latest verification state.",
        ],
        cta: {
          label: "Open onboarding",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.merchant_approved":
      return {
        subject: `${merchantName} business verification approved`,
        eyebrow: "Business verified",
        heading: "Business verification is approved.",
        body: [
          "The merchant business profile has passed verification.",
          "Live payment operations can continue where enabled.",
        ],
        cta: {
          label: "Open overview",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
    case "merchant.verification.merchant_rejected":
      return {
        subject: `${merchantName} business verification rejected`,
        eyebrow: "Business verification",
        heading: "Business verification was rejected.",
        body: [
          `Status received: ${statusLabel}.`,
          "Review the provider response and prepare a corrected submission.",
        ],
        cta: {
          label: "Open onboarding",
          url: appUrl,
        },
      } satisfies NotificationTemplateDocument;
  }

  const exhaustiveTemplateKey: never = input.templateKey;
  throw new Error(`Unhandled notification template: ${exhaustiveTemplateKey}`);
}

function renderText(document: NotificationTemplateDocument) {
  return [
    document.subject,
    "",
    document.heading,
    "",
    ...document.body,
    ...(document.cta ? ["", `${document.cta.label}: ${document.cta.url}`] : []),
  ].join("\n");
}

function renderHtml(input: {
  branding: NotificationTemplateBranding;
  document: NotificationTemplateDocument;
}) {
  const accent = escapeHtml(input.branding.brandAccent || "#335c46");
  const body = input.document.body
    .map((line) => `<p style="margin:0 0 14px;color:#334238;line-height:1.6;">${escapeHtml(line)}</p>`)
    .join("");
  const cta = input.document.cta
    ? `<a href="${escapeHtml(input.document.cta.url)}" style="display:inline-block;border-radius:12px;background:${accent};color:#fff;text-decoration:none;padding:12px 16px;font-weight:700;">${escapeHtml(input.document.cta.label)}</a>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;background:#eef3ed;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef3ed;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#fff;border-radius:20px;padding:32px;border:1px solid #dde7dd;">
            <tr>
              <td>
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${accent};font-weight:800;">${escapeHtml(input.document.eyebrow)}</div>
                <h1 style="margin:12px 0 16px;font-size:28px;line-height:1.15;color:#132018;">${escapeHtml(input.document.heading)}</h1>
                ${body}
                ${cta}
                <p style="margin:28px 0 0;color:#6d7a70;font-size:13px;">${escapeHtml(input.branding.merchantName)}</p>
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
}) {
  const document = buildTemplateDocument(input);

  return {
    subject: document.subject,
    html: renderHtml({
      branding: input.branding,
      document,
    }),
    text: renderText(document),
  };
}

export function buildNotificationTemplatePreviewPayload(
  templateKey: NotificationTemplateKey
) {
  switch (templateKey) {
    case "customer.payment.receipt":
      return {
        amountLabel: "NGN 26,500",
        referenceLabel: "Order #1042",
        paymentReference: "pay_1042",
        releaseAtLabel: "May 8, 2026 at 10:00",
        issueUrl: "https://app.renew.sh/pay/pay_1042/report",
        appUrl: "https://app.renew.sh/pay/pay_1042",
      };
    case "customer.payment.issue_received":
      return {
        referenceLabel: "Order #1042",
        appUrl: "https://app.renew.sh/pay/pay_1042",
      };
    case "merchant.payment.paid":
    case "merchant.payment.failed":
      return {
        amountLabel: "NGN 26,500",
        referenceLabel: "Order #1042",
        releaseAtLabel: "May 8, 2026 at 10:00",
        appUrl: "https://app.renew.sh/dashboard/collections",
      };
    case "merchant.settlement.scheduled":
    case "merchant.settlement.held":
    case "merchant.settlement.settled":
    case "merchant.settlement.failed":
      return {
        settlementAmountLabel: "16.04 USDC",
        referenceLabel: "Order #1042",
        destinationLabel: "GB2NKG6W...7UPO6KD",
        releaseAtLabel: "May 8, 2026 at 10:00",
        appUrl: "https://app.renew.sh/dashboard/payouts",
      };
    case "merchant.verification.owner_needs_action":
    case "merchant.verification.owner_approved":
    case "merchant.verification.owner_rejected":
    case "merchant.verification.merchant_needs_action":
    case "merchant.verification.merchant_approved":
    case "merchant.verification.merchant_rejected":
      return {
        statusLabel: "pending",
        appUrl: "https://app.renew.sh/overview",
      };
  }

  const exhaustiveTemplateKey: never = templateKey;
  throw new Error(`Unhandled preview template: ${exhaustiveTemplateKey}`);
}
