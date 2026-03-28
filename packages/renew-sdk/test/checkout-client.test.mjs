import test from "node:test";
import assert from "node:assert/strict";

import { createRenewCheckoutClient } from "../dist/core/index.js";

test("uses secret key headers for plan discovery", async () => {
  let captured = null;

  const client = createRenewCheckoutClient({
    environment: "sandbox",
    fetch: async (url, init) => {
      captured = { url, init };

      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    },
  });

  await client.listPlans({ secretKey: "rw_test_example" });

  assert.equal(captured.url, "https://staging-pay.renew.sh/v1/checkout/plans");
  assert.equal(captured.init.method, "GET");
  assert.equal(captured.init.headers["x-renew-secret-key"], "rw_test_example");
});

test("uses client secret headers for session fetch", async () => {
  let captured = null;

  const client = createRenewCheckoutClient({
    environment: "sandbox",
    fetch: async (url, init) => {
      captured = { url, init };

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "chk_123",
            environment: "sandbox",
            status: "open",
            expiresAt: new Date().toISOString(),
            submittedAt: null,
            completedAt: null,
            nextAction: "submit_customer",
            plan: {
              id: "plan_123",
              planCode: "core",
              name: "Core Plan",
              usdAmount: 49,
              billingIntervalDays: 30,
              trialDays: 0,
              retryWindowHours: 24,
              billingMode: "fixed",
              supportedMarkets: ["NGN"],
            },
            customer: null,
            charge: null,
            settlement: null,
            paymentInstructions: null,
            failureReason: null,
            testMode: {
              enabled: true,
              canCompletePayment: false,
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    },
  });

  await client.getSession("chk_123", { clientSecret: "cs_test_123" });

  assert.equal(
    captured.url,
    "https://staging-pay.renew.sh/v1/checkout/sessions/chk_123"
  );
  assert.equal(captured.init.headers["x-renew-client-secret"], "cs_test_123");
});
