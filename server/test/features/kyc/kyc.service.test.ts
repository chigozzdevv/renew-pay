import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "@/features/kyc/kyc.service";

test("Didit webhook lookup falls back to the stable external user id", () => {
  assert.deepEqual(
    __test__.buildDiditWebhookRecordQueries({
      applicantId: "session_old",
      externalUserId: "renew:verification:owner:merchant_123:merchant_123",
    }),
    [
      {
        applicantId: "session_old",
        mode: "global",
      },
      {
        externalUserId: "renew:verification:owner:merchant_123:merchant_123",
        mode: "global",
      },
    ]
  );
});

test("Didit webhook lookup can match vendor data without a session id", () => {
  assert.deepEqual(
    __test__.buildDiditWebhookRecordQueries({
      applicantId: null,
      externalUserId: "renew:verification:merchant:merchant_123",
    }),
    [
      {
        externalUserId: "renew:verification:merchant:merchant_123",
        mode: "global",
      },
    ]
  );
});
