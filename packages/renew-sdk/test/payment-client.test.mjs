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

test("creates settlement routes with server key scope", async () => {
  let captured = null;

  const client = createRenewPaymentClient({
    environment: "sandbox",
    fetch: async (url, init) => {
      captured = { url, init };

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "route_123",
            merchantId: "merchant_123",
            environment: "test",
            routeCode: "main-wallet",
            name: "Main wallet",
            mode: "standard",
            provider: "direct",
            chain: "solana",
            assetSymbol: "USDC",
            assetMint: "EPjFWdd5AufqSSqeM2q7hF8uVjPgnjK4s7t1v6Xh4Jz",
            assetDecimals: 6,
            destinationAddress: "11111111111111111111111111111111",
            feeBps: 0,
            isDefault: true,
            status: "active",
            privacy: null,
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

  await client.createSettlementRoute(
    {
      routeCode: "main-wallet",
      name: "Main wallet",
      destinationAddress: "11111111111111111111111111111111",
      isDefault: true,
    },
    { secretKey: "rw_test_example" }
  );

  assert.equal(captured.url, "https://staging-pay.renew.sh/v1/settlement/routes");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["x-renew-secret-key"], "rw_test_example");
  assert.deepEqual(JSON.parse(captured.init.body), {
    routeCode: "main-wallet",
    name: "Main wallet",
    destinationAddress: "11111111111111111111111111111111",
    isDefault: true,
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
            customer: {
              reference: "customer_123",
              email: "customer@example.com",
              name: "Amina Yusuf",
            },
            checkout: {
              state: "show_bank_transfer",
              verification: {
                methods: [],
                selectedMethod: null,
                selectedHint: null,
                phoneConfirmationRequired: false,
                message: null,
                bvnLast4: null,
              },
              returnPage: null,
              bankTransfer: {
                bankCode: "101",
                bankName: "Providus Bank",
                accountName: "Renew merchant - Amina Yusuf",
                accountNumber: "1234567890",
                currency: "NGN",
              },
            },
            collection: {
              provider: "partna",
              status: "pending",
              localAmount: 25000,
              stableAmount: 16,
              feeAmount: 0,
              paidAt: null,
              paymentUrl: null,
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
