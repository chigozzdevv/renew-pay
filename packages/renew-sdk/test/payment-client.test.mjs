import test from "node:test";
import assert from "node:assert/strict";

import { createRenewPaymentClient } from "../dist/core/index.js";

test("uses server key headers for payment creation", async () => {
  let captured = null;

  const client = createRenewPaymentClient({
    environment: "sandbox",
    fetch: async (url, init) => {
      captured = { url, init };

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "paydoc_123",
            merchantId: "merchant_123",
            environment: "test",
            payId: "pay_123",
            customerId: null,
            settlementRouteId: "route_123",
            amount: 25000,
            currency: "NGN",
            description: "Website order",
            status: "open",
            paymentUrl: "https://app.renew.sh/pay/pay_123",
            recurring: {
              enabled: false,
              interval: null,
              intervalCount: null,
              startsAt: null,
              endsAt: null,
            },
            collection: {
              provider: "partna",
              status: "not_started",
              externalId: null,
              localAmount: null,
              fxRate: null,
              stableAmount: null,
              feeAmount: null,
              paidAt: null,
            },
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
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

  await client.createPayment(
    {
      amount: 25000,
      currency: "NGN",
      description: "Website order",
    },
    { secretKey: "rw_test_example" }
  );

  assert.equal(captured.url, "https://staging-pay.renew.sh/v1/payments");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["x-renew-secret-key"], "rw_test_example");
});

test("creates collections through the collections endpoint", async () => {
  let captured = null;

  const client = createRenewPaymentClient({
    environment: "sandbox",
    fetch: async (url, init) => {
      captured = { url, init };

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "pay_123",
            paymentId: "paydoc_123",
            reference: "order_1042",
            amount: 25000,
            currency: "NGN",
            description: "Order #1042",
            status: "created",
            checkoutUrl: "https://app.renew.sh/pay/pay_123",
            recurring: {
              enabled: false,
              interval: null,
              intervalCount: null,
              startsAt: null,
              endsAt: null,
            },
            settlement: null,
            customer: null,
            metadata: {
              reference: "order_1042",
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
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

  await client.createCollection(
    {
      amount: 25000,
      currency: "NGN",
      reference: "order_1042",
      description: "Order #1042",
      settlement: "default",
      customer: {
        reference: "user_123",
      },
    },
    { secretKey: "rw_test_example" }
  );

  assert.equal(captured.url, "https://staging-pay.renew.sh/v1/collections");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["x-renew-secret-key"], "rw_test_example");
  assert.deepEqual(JSON.parse(captured.init.body), {
    amount: 25000,
    currency: "NGN",
    reference: "order_1042",
    description: "Order #1042",
    settlement: "default",
    customer: {
      reference: "user_123",
    },
    recurring: {
      enabled: false,
      interval: null,
      intervalCount: null,
      startsAt: null,
      endsAt: null,
    },
  });
});

test("starts a public payment with payer details", async () => {
  let captured = null;

  const client = createRenewPaymentClient({
    environment: "sandbox",
    fetch: async (url, init) => {
      captured = { url, init };

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            payId: "pay_123",
            amount: 25000,
            currency: "NGN",
            description: "Website order",
            status: "pending",
            paymentUrl: "https://app.renew.sh/pay/pay_123",
            merchant: {
              name: "Renew merchant",
              supportEmail: null,
              logoUrl: null,
            },
            recurring: {
              enabled: false,
              interval: null,
              intervalCount: null,
            },
            collection: {
              provider: "partna",
              status: "pending",
              localAmount: 25000,
              stableAmount: 16,
              feeAmount: 0,
              paidAt: null,
              paymentUrl: "https://partna.example/pay",
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

  await client.startPublicPayment("pay_123", {
    payerEmail: "customer@example.com",
    payerName: "Amina Yusuf",
  });

  assert.equal(
    captured.url,
    "https://staging-pay.renew.sh/v1/pay/pay_123/start"
  );
  assert.equal(captured.init.method, "POST");
  assert.deepEqual(JSON.parse(captured.init.body), {
    payerEmail: "customer@example.com",
    payerName: "Amina Yusuf",
  });
});
