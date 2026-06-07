import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "@/features/payouts/payout.service";

test("held payouts keep linked payments in settling state", () => {
  assert.equal(__test__.resolvePaymentStatusFromPayout("held"), "settling");
});

test("only terminal or held payouts skip processing", () => {
  assert.equal(
    __test__.shouldSkipPayoutProcessing({ status: "queued", creditTxHash: null }),
    false
  );
  assert.equal(
    __test__.shouldSkipPayoutProcessing({ status: "confirming", creditTxHash: null }),
    false
  );
  assert.equal(
    __test__.shouldSkipPayoutProcessing({ status: "held", creditTxHash: null }),
    true
  );
  assert.equal(
    __test__.shouldSkipPayoutProcessing({ status: "settled", creditTxHash: null }),
    true
  );
  assert.equal(
    __test__.shouldSkipPayoutProcessing({ status: "queued", creditTxHash: "tx_123" }),
    true
  );
});

test("scheduled payout delay is never negative", (context) => {
  context.mock.method(Date, "now", () => 1_000);

  assert.equal(
    __test__.getPayoutProcessingDelay({ scheduledFor: new Date(900) }),
    0
  );
  assert.equal(
    __test__.getPayoutProcessingDelay({ scheduledFor: new Date(1_500) }),
    500
  );
});

test("owner KYC starter tier holds payouts above the daily cap", () => {
  assert.equal(
    __test__.shouldHoldForStarterDailyLimit({
      verificationTier: "owner",
      payoutStatus: "queued",
      dailyVolumeUsdc: 999,
      payoutNetUsdc: 2,
    }),
    true
  );
  assert.equal(
    __test__.shouldHoldForStarterDailyLimit({
      verificationTier: "owner",
      payoutStatus: "queued",
      dailyVolumeUsdc: 400,
      payoutNetUsdc: 100,
    }),
    false
  );
  assert.equal(
    __test__.shouldHoldForStarterDailyLimit({
      verificationTier: "business",
      payoutStatus: "queued",
      dailyVolumeUsdc: 1_500,
      payoutNetUsdc: 10_000,
    }),
    false
  );
  assert.equal(
    __test__.shouldHoldForStarterDailyLimit({
      verificationTier: "owner",
      payoutStatus: "settled",
      dailyVolumeUsdc: 1_500,
      payoutNetUsdc: 10_000,
    }),
    false
  );
});
