import test from "node:test";
import assert from "node:assert/strict";

import {
  renewWebhookHeaderNames,
  signRenewWebhookPayload,
  verifyRenewWebhookSignature,
} from "../dist/server/index.js";

test("signs and verifies a webhook payload", () => {
  const payload = JSON.stringify({ event: "charge.settled", id: "evt_123" });
  const signed = signRenewWebhookPayload({
    payload,
    signingSecret: "test_secret",
    timestamp: 1_710_000_000,
  });

  assert.equal(
    verifyRenewWebhookSignature({
      payload,
      signingSecret: "test_secret",
      signatureHeader: signed.headers[renewWebhookHeaderNames.signature],
      timestampHeader: signed.headers[renewWebhookHeaderNames.timestamp],
      now: 1_710_000_000,
    }),
    true
  );
});

test("rejects webhook payload with invalid signature", () => {
  const payload = JSON.stringify({ event: "charge.failed", id: "evt_456" });

  assert.equal(
    verifyRenewWebhookSignature({
      payload,
      signingSecret: "test_secret",
      signatureHeader: "v1=bad_signature",
      timestampHeader: "1710000000",
      now: 1_710_000_000,
    }),
    false
  );
});
