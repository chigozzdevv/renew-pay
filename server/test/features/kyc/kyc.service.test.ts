import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "@/features/kyc/kyc.service";

test("Didit webhook lookup falls back to the stable external user id", () => {
  assert.deepEqual(
    __test__.buildWebhookRecordQueries({
      provider: "didit",
      applicantId: "session_old",
      externalUserId: "renew:verification:owner:merchant_123:merchant_123",
    }),
    [
      {
        provider: "didit",
        applicantId: "session_old",
        mode: "global",
      },
      {
        provider: "didit",
        externalUserId: "renew:verification:owner:merchant_123:merchant_123",
        mode: "global",
      },
    ]
  );
});

test("Didit webhook lookup can match vendor data without a session id", () => {
  assert.deepEqual(
    __test__.buildWebhookRecordQueries({
      provider: "didit",
      applicantId: null,
      externalUserId: "renew:verification:merchant:merchant_123",
    }),
    [
      {
        provider: "didit",
        externalUserId: "renew:verification:merchant:merchant_123",
        mode: "global",
      },
    ]
  );
});
