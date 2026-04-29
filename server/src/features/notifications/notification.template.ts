type NotificationAudience = "merchant";

export const notificationTemplateKeys = [
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

  switch (input.templateKey) {
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
