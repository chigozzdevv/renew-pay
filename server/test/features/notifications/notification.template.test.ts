import assert from "node:assert/strict";
import test from "node:test";

import {
  notificationTemplateKeys,
  renderNotificationTemplate,
} from "@/features/notifications/notification.template";

const branding = {
  merchantName: "Acme Store",
  supportEmail: "support@acme.test",
  brandAccent: "#272b25",
  renewLogoUrl: "https://www.renew.sh/renew-logo.png",
};

test("merchant issue report email includes issue details and hold status", () => {
  const rendered = renderNotificationTemplate({
    templateKey: "merchant.payment.issue_reported",
    branding,
    payload: {
      referenceLabel: "Order #1042",
      amountLabel: "NGN 25,000",
      issueTypeLabel: "Paid but not confirmed",
      issueDetails: "Customer says the bank transfer has been completed.",
      issueHoldLabel: "Payout held",
      customerLabel: "Ada Okafor - ada@example.com",
      issueFilesLabel: "receipt.png",
      appUrl: "https://www.renew.sh/dashboard/collections",
    },
  });

  assert.equal(rendered.subject, "Payment issue reported for Order #1042");
  assert.match(rendered.text, /Paid but not confirmed/);
  assert.match(rendered.text, /NGN 25,000/);
  assert.match(rendered.text, /Ada Okafor - ada@example.com/);
  assert.match(rendered.text, /Payout held/);
  assert.match(rendered.text, /receipt\.png/);
});

test("merchant settlement held template is not exposed", () => {
  assert.equal(
    (notificationTemplateKeys as readonly string[]).includes("merchant.settlement.held"),
    false
  );
});
