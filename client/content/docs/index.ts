export type DocsCategoryId = "api" | "sdk";

export type CodeLanguage = "bash" | "ts" | "tsx" | "json" | "sol";

export type DocsReference = {
  label: string;
  value: string;
  detail: string;
};

export type DocsSample = {
  label: string;
  language: CodeLanguage;
  filename?: string;
  code: string;
};

export type DocsArticleSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  steps?: string[];
  note?: string;
  references?: DocsReference[];
  sample?: DocsSample;
  samples?: DocsSample[];
};

export type DocsPage = {
  id: string;
  category: DocsCategoryId;
  group: string;
  navTitle: string;
  title: string;
  description: string;
  sections: DocsArticleSection[];
};

export type DocsCategory = {
  id: DocsCategoryId;
  label: string;
};

export const docsCategories: DocsCategory[] = [
  { id: "api", label: "API" },
  { id: "sdk", label: "SDK" },
];

const docsPageOrder: Record<DocsCategoryId, string[]> = {
  api: [
    "api-overview",
    "api-environment",
    "api-collection",
    "api-checkout",
    "api-webhooks",
    "api-settlement",
    "api-customers",
    "api-playground",
  ],
  sdk: [
    "sdk-quickstart",
    "sdk-server",
    "sdk-checkout",
    "sdk-react",
  ],
};

function createJsonSample(
  label: string,
  filename: string,
  value: Record<string, unknown>,
): DocsSample {
  return {
    label,
    language: "json",
    filename,
    code: JSON.stringify(value, null, 2),
  };
}

export const docsPages: DocsPage[] = [
  {
    id: "api-overview",
    category: "api",
    group: "Start here",
    navTitle: "Overview",
    title: "Overview",
    description: "Collect local fiat payments and receive Avalanche USDC settlement.",
    sections: [
      {
        id: "api-overview-flow",
        title: "How Renew works",
        paragraphs: [
          "Renew lets your customers pay in local currency while your business receives settlement in Avalanche USDC.",
        ],
        steps: [
          "Connect your Avalanche settlement wallet.",
          "Create a server key.",
          "Create a collection from your backend.",
          "Open Renew Checkout for the customer.",
          "Fulfill after your webhook receives `collection.paid`.",
          "Track settlement from the dashboard.",
        ],
      },
      {
        id: "api-overview-objects",
        title: "Core objects",
        paragraphs: [
          "Most integrations only need these objects.",
        ],
        references: [
          { label: "Collection", value: "Money to collect", detail: "An amount, currency, and reference for an order, invoice, or subscription." },
          { label: "Checkout", value: "Customer payment flow", detail: "The Renew-hosted page or modal where the customer completes payment." },
          { label: "Customer", value: "Payer profile", detail: "Renew creates or updates this from checkout details." },
          { label: "Settlement", value: "Avalanche USDC payout", detail: "The release state for collected value after payment is confirmed." },
        ],
      },
      {
        id: "api-overview-settlement",
        title: "Settlement path",
        paragraphs: [
          "After payment is confirmed, Renew routes the collected value to Avalanche USDC through Circle CCTP, places it in the settlement vault, and releases it to your Avalanche wallet after the release window.",
        ],
        references: [
          { label: "Asset", value: "USDC", detail: "Merchant settlement asset." },
          { label: "Network", value: "Avalanche", detail: "Wallet and settlement release network." },
          { label: "Release", value: "Next day", detail: "Settlement can be held if a payment issue is reported before release." },
        ],
      },
    ],
  },
  {
    id: "api-environment",
    category: "api",
    group: "Start here",
    navTitle: "Environment",
    title: "Environment",
    description: "Use sandbox for testing and live for production payments.",
    sections: [
      {
        id: "api-environment-hosts",
        title: "Base URLs",
        paragraphs: [
          "Your API host must match the server key you use.",
        ],
        references: [
          { label: "Sandbox", value: "https://sandbox.renew.sh/v1", detail: "Use with `rw_test_...` keys." },
          { label: "Live", value: "https://api.renew.sh/v1", detail: "Use with `rw_live_...` keys." },
          { label: "Header", value: "x-renew-secret-key", detail: "Send the server key on backend API requests." },
        ],
        note: "Do not send an `environment` field in API payloads. The server key and base URL decide the environment.",
      },
      {
        id: "api-environment-keys",
        title: "Server keys",
        paragraphs: [
          "Create server keys in Dashboard > Settings > Developers. Keep server keys on your backend only.",
        ],
        steps: [
          "Open Dashboard > Settings > Developers.",
          "Choose Test or Live.",
          "Create a server key.",
          "Store the key securely.",
          "Use it only from your server.",
        ],
      },
      {
        id: "api-environment-request",
        title: "Request example",
        paragraphs: ["Every server API call uses the same header."],
        sample: {
          label: "Authenticated request",
          language: "bash",
          filename: "request.sh",
          code: `curl https://sandbox.renew.sh/v1/collections \\
  -H "x-renew-secret-key: $RENEW_SECRET_KEY" \\
  -H "Content-Type: application/json"`,
        },
      },
    ],
  },
  {
    id: "api-collection",
    category: "api",
    group: "Build",
    navTitle: "Collection",
    title: "Collection",
    description: "Create a collection when a customer is ready to pay.",
    sections: [
      {
        id: "api-collection-create",
        title: "Create a collection",
        paragraphs: [
          "Create collections from your backend. The `reference` should be your order, invoice, cart, or subscription id.",
        ],
        sample: {
          label: "Create collection",
          language: "bash",
          filename: "create-collection.sh",
          code: `curl https://sandbox.renew.sh/v1/collections \\
  -H "x-renew-secret-key: $RENEW_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 2000,
    "currency": "NGN",
    "reference": "order_1042",
    "description": "Order #1042"
  }'`,
        },
      },
      {
        id: "api-collection-fields",
        title: "Fields",
        paragraphs: [
          "`amount`, `currency`, and `reference` are required. Everything else depends on how much context you already have.",
        ],
        references: [
          { label: "Required", value: "amount", detail: "Local amount to collect." },
          { label: "Required", value: "currency", detail: "`NGN`, `GHS`, or `KES`." },
          { label: "Required", value: "reference", detail: "Your internal order, invoice, or subscription id." },
          { label: "Optional", value: "items", detail: "Line items shown in checkout." },
          { label: "Optional", value: "customer", detail: "Known customer details for prefill." },
          { label: "Optional", value: "settlement", detail: "`default`, a settlement account code, or account id." },
          { label: "Optional", value: "recurring", detail: "Use for subscriptions." },
        ],
      },
      {
        id: "api-collection-items",
        title: "Items and customer prefill",
        paragraphs: [
          "Pass items and customer details only when you already have them. Renew still collects any required payment details during checkout.",
        ],
        sample: {
          label: "Collection with items",
          language: "json",
          filename: "collection.json",
          code: JSON.stringify(
            {
              amount: 2000,
              currency: "NGN",
              reference: "order_1042",
              items: [
                { name: "Linen shirt", amount: 1200, quantity: 1 },
                { name: "Classic cap", amount: 800, quantity: 1 },
              ],
              customer: {
                reference: "user_123",
                email: "ada@example.com",
                name: "Ada Okafor",
              },
            },
            null,
            2
          ),
        },
      },
      {
        id: "api-collection-response",
        title: "Create response",
        paragraphs: [
          "Send `checkoutUrl` to the browser SDK or redirect the customer to the hosted URL.",
        ],
        samples: [
          createJsonSample("Create response", "create-collection.response.json", {
            id: "pay_7de830caf3cc49df9f18d8a1",
            paymentId: "66f1d2c11d0e63b8a1",
            reference: "order_1042",
            amount: 2000,
            currency: "NGN",
            description: "Order #1042",
            status: "created",
            checkoutUrl: "https://www.renew.sh/pay/pay_7de830caf3cc49df9f18d8a1",
          }),
        ],
      },
      {
        id: "api-collection-statuses",
        title: "Statuses",
        paragraphs: ["Use webhook events, not browser callbacks, to fulfill orders."],
        references: [
          { label: "Status", value: "created", detail: "Collection exists but checkout has not started." },
          { label: "Status", value: "collecting", detail: "Customer is in checkout or bank transfer details have been issued." },
          { label: "Status", value: "paid", detail: "Payment has been confirmed." },
          { label: "Status", value: "failed", detail: "Collection cannot be completed." },
          { label: "Status", value: "cancelled", detail: "Collection was cancelled before payment." },
        ],
      },
      {
        id: "api-collection-endpoints",
        title: "Endpoints",
        paragraphs: ["Use these endpoints from your backend."],
        references: [
          { label: "POST", value: "/collections", detail: "Create a collection and receive a checkout URL." },
          { label: "GET", value: "/collections", detail: "List collections." },
          { label: "GET", value: "/collections/:collectionId", detail: "Fetch one collection." },
          { label: "POST", value: "/collections/:collectionId/cancel", detail: "Cancel an unpaid collection." },
        ],
      },
    ],
  },
  {
    id: "api-checkout",
    category: "api",
    group: "Build",
    navTitle: "Checkout",
    title: "Checkout",
    description: "Open Renew Checkout after creating a collection.",
    sections: [
      {
        id: "api-checkout-modal",
        title: "Modal checkout",
        paragraphs: [
          "Use the SDK to open the checkout URL in a modal over your site.",
        ],
        sample: {
          label: "Open modal",
          language: "ts",
          filename: "checkout.ts",
          code: `import { checkout } from "@renew.sh/sdk";

checkout.open(collection.checkoutUrl);`,
        },
      },
      {
        id: "api-checkout-redirect",
        title: "Hosted redirect",
        paragraphs: [
          "You can also redirect the customer to the hosted checkout URL.",
        ],
        sample: {
          label: "Redirect",
          language: "ts",
          filename: "redirect.ts",
          code: `window.location.href = collection.checkoutUrl;`,
        },
      },
      {
        id: "api-checkout-return-url",
        title: "Return URL",
        paragraphs: [
          "Set an optional return URL in Dashboard > Settings > Developers. Hosted checkout redirects there after a successful payment.",
        ],
        sample: {
          label: "Return page",
          language: "bash",
          filename: "return-url.txt",
          code: `https://merchant.com/checkout/return?collection=pay_7de830caf3cc49df9f18d8a1&status=paid`,
        },
        note: "A return URL is for customer navigation. Fulfill orders only after a verified `collection.paid` webhook.",
      },
      {
        id: "api-checkout-success",
        title: "Success behavior",
        paragraphs: [
          "Modal checkout shows the success state and closes. Hosted checkout shows the same success state, then redirects to your return URL when one is configured.",
        ],
      },
    ],
  },
  {
    id: "api-webhooks",
    category: "api",
    group: "Build",
    navTitle: "Webhooks",
    title: "Webhooks",
    description: "Use webhooks as the source of truth for fulfillment.",
    sections: [
      {
        id: "api-webhooks-create",
        title: "Create a webhook",
        paragraphs: ["Create webhook endpoints from Settings > Developers. Store the signing secret when it is shown."],
        steps: [
          "Open Dashboard > Settings > Developers.",
          "Choose Test or Live.",
          "Add your webhook URL.",
          "Choose events to receive.",
          "Store the signing secret.",
          "Send a test delivery before going live.",
        ],
      },
      {
        id: "api-webhooks-events",
        title: "Events",
        paragraphs: ["Use collection events for order state and settlement events for payout tracking."],
        bullets: [
          "`collection.paid`",
          "`collection.failed`",
          "`settlement.settled`",
          "`settlement.failed`",
        ],
      },
      {
        id: "api-webhooks-signatures",
        title: "Signatures",
        paragraphs: ["Renew signs each webhook delivery. Verify the raw request body before trusting the event."],
        references: [
          { label: "Header", value: "x-renew-signature", detail: "Signature header formatted as `v1=<digest>`." },
          { label: "Header", value: "x-renew-timestamp", detail: "Unix timestamp used in the signed payload." },
          { label: "Secret", value: "whsec_*", detail: "Webhook signing secret shown when the endpoint is created." },
        ],
      },
      {
        id: "api-webhooks-fulfillment",
        title: "Fulfillment rule",
        paragraphs: ["Fulfill only after your server receives and verifies `collection.paid`."],
        sample: {
          label: "Fulfill order",
          language: "ts",
          filename: "webhook.ts",
          code: `if (event.type === "collection.paid") {
  await orders.markPaid(event.data.collection.reference);
}`,
        },
      },
    ],
  },
  {
    id: "api-settlement",
    category: "api",
    group: "Settle",
    navTitle: "Settlement",
    title: "Settlement",
    description: "Connect your Avalanche wallet and track USDC settlement.",
    sections: [
      {
        id: "api-settlement-wallet",
        title: "Settlement wallet",
        paragraphs: [
          "Connect the Avalanche wallet that should receive USDC settlement in Dashboard > Settings > Settlement.",
        ],
        steps: [
          "Open Dashboard > Settings > Settlement.",
          "Connect an Avalanche wallet.",
          "Save the wallet.",
        ],
      },
      {
        id: "api-settlement-release",
        title: "Release flow",
        paragraphs: [
          "After a collection is paid, settlement moves through deposit, scheduled release, and released states. You can track this in Dashboard > Settlement.",
        ],
        references: [
          { label: "Deposit", value: "Completed", detail: "USDC has entered the settlement vault." },
          { label: "Release", value: "Scheduled", detail: "Settlement is waiting for the release window." },
          { label: "Release", value: "Released", detail: "USDC has been sent to your Avalanche wallet." },
        ],
      },
      {
        id: "api-settlement-api",
        title: "Advanced API setup",
        paragraphs: [
          "Most merchants should connect a wallet from the dashboard. Use the API only when you already have the wallet address and want to manage settlement accounts from your backend.",
        ],
        sample: {
          label: "Create settlement account",
          language: "bash",
          filename: "create-settlement-account.sh",
          code: `curl https://sandbox.renew.sh/v1/settlement/accounts \\
  -H "x-renew-secret-key: $RENEW_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "accountCode": "main-wallet",
    "name": "Main wallet",
    "destinationAddress": "YOUR_AVALANCHE_WALLET",
    "isDefault": true
  }'`,
        },
      },
      {
        id: "api-settlement-selection",
        title: "Collection settlement",
        paragraphs: [
          "Collections use your default settlement wallet unless you pass a settlement account code or id.",
        ],
        sample: {
          label: "Use a settlement account",
          language: "json",
          filename: "collection-settlement.json",
          code: JSON.stringify(
            {
              amount: 2000,
              currency: "NGN",
              reference: "order_1042",
              settlement: "main-wallet",
            },
            null,
            2
          ),
        },
      },
      {
        id: "api-settlement-endpoints",
        title: "Endpoints",
        paragraphs: ["Use these endpoints when managing settlement accounts from your backend."],
        references: [
          { label: "POST", value: "/settlement/accounts", detail: "Create an Avalanche settlement account." },
          { label: "GET", value: "/settlement/accounts", detail: "List settlement accounts." },
          { label: "GET", value: "/settlement/accounts/default", detail: "Fetch the default account." },
          { label: "GET", value: "/settlement/accounts/:accountId", detail: "Fetch one account." },
          { label: "PATCH", value: "/settlement/accounts/:accountId", detail: "Update an account." },
        ],
      },
    ],
  },
  {
    id: "api-customers",
    category: "api",
    group: "Operations",
    navTitle: "Customers",
    title: "Customers",
    description: "View payer profiles Renew creates from checkout.",
    sections: [
      {
        id: "api-customers-role",
        title: "How customers work",
        paragraphs: [
          "You do not need to create customers before checkout. Renew creates or updates the customer profile from checkout details.",
        ],
      },
      {
        id: "api-customers-prefill",
        title: "Customer prefill",
        paragraphs: [
          "Pass `customer.reference`, `customer.email`, or `customer.name` only when you already have them.",
        ],
        references: [
          { label: "reference", value: "user_123", detail: "Your internal customer id." },
          { label: "email", value: "ada@example.com", detail: "Used to prefill checkout when available." },
          { label: "name", value: "Ada Okafor", detail: "Used to prefill checkout when available." },
        ],
      },
    ],
  },
  {
    id: "api-playground",
    category: "api",
    group: "Test",
    navTitle: "Playground",
    title: "Playground",
    description: "Try Renew Checkout with sandbox collections.",
    sections: [
      {
        id: "api-playground-use",
        title: "Use the playground",
        paragraphs: [
          "The playground creates sandbox collections with small amounts and opens the same checkout flow your customers use.",
        ],
        steps: [
          "Open Playground.",
          "Choose a use case.",
          "Choose a currency.",
          "Select items.",
          "Open Renew Checkout.",
          "Complete the sandbox payment flow.",
        ],
      },
      {
        id: "api-playground-build",
        title: "Build your own test flow",
        paragraphs: [
          "For your own test app, create a `rw_test_...` server key and call the sandbox API from your backend.",
        ],
        references: [
          { label: "Base URL", value: "https://sandbox.renew.sh/v1", detail: "Sandbox API." },
          { label: "Key", value: "rw_test_...", detail: "Use only from your backend." },
          { label: "Checkout", value: "checkout.open(...)", detail: "Open the returned checkout URL from your frontend." },
        ],
      },
      {
        id: "api-playground-webhooks",
        title: "Webhook testing",
        paragraphs: [
          "Use a test webhook endpoint to verify `collection.paid` before moving to live.",
        ],
      },
    ],
  },
  {
    id: "sdk-quickstart",
    category: "sdk",
    group: "Start here",
    navTitle: "Quickstart",
    title: "SDK quickstart",
    description: "Create a collection on your server and open checkout in the browser.",
    sections: [
      {
        id: "sdk-quickstart-install",
        title: "Install",
        paragraphs: ["Install the SDK in the app that creates collections and opens checkout."],
        sample: {
          label: "Install",
          language: "bash",
          filename: "terminal",
          code: "npm install @renew.sh/sdk",
        },
      },
      {
        id: "sdk-quickstart-server",
        title: "Create collection",
        paragraphs: ["Create the collection on your server and return only the checkout URL to the browser."],
        sample: {
          label: "Create checkout",
          language: "ts",
          filename: "server.ts",
          code: `import { renew } from "@renew.sh/sdk";

const client = renew({
  secretKey: process.env.RENEW_SECRET_KEY!,
});

export async function createCheckout(order: {
  id: string;
  total: number;
  currency: "NGN" | "KES" | "GHS";
  customer: {
    id: string;
    email?: string;
    name?: string;
  };
}) {
  const collection = await client.collections.create({
    amount: order.total,
    currency: order.currency,
    reference: order.id,
    description: "Order " + order.id,
    customer: {
      reference: order.customer.id,
      email: order.customer.email,
      name: order.customer.name,
    },
  });

  return {
    collectionId: collection.id,
    checkoutUrl: collection.checkoutUrl,
  };
}`,
        },
      },
      {
        id: "sdk-quickstart-browser",
        title: "Open checkout",
        paragraphs: ["The browser never sees the server key. It asks your server for a checkout URL, then opens Renew Checkout."],
        sample: {
          label: "Open checkout",
          language: "tsx",
          filename: "PayButton.tsx",
          code: `"use client";

import { checkout } from "@renew.sh/sdk";

export function PayButton({ orderId }: { orderId: string }) {
  async function pay() {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const collection = await response.json();

    checkout.open(collection.checkoutUrl);
  }

  return <button onClick={pay}>Pay</button>;
}`,
        },
      },
    ],
  },
  {
    id: "sdk-server",
    category: "sdk",
    group: "Server",
    navTitle: "Server",
    title: "Server",
    description: "Use the server SDK for collections, settlement accounts, and webhooks.",
    sections: [
      {
        id: "sdk-server-client",
        title: "Create a client",
        paragraphs: ["The SDK infers sandbox or live from your server key."],
        sample: {
          label: "Server client",
          language: "ts",
          filename: "client.ts",
          code: `import { renew } from "@renew.sh/sdk";

const client = renew({
  secretKey: process.env.RENEW_SECRET_KEY!,
});`,
        },
      },
      {
        id: "sdk-server-collections",
        title: "Collections",
        paragraphs: ["Use collection methods from your backend."],
        sample: {
          label: "Collection methods",
          language: "ts",
          filename: "collections.ts",
          code: `await client.collections.create(input);
await client.collections.list();
await client.collections.get(collectionId);
await client.collections.cancel(collectionId);`,
        },
      },
      {
        id: "sdk-server-settlement",
        title: "Settlement accounts",
        paragraphs: ["Use settlement account methods when you want to manage settlement from your backend."],
        sample: {
          label: "Settlement methods",
          language: "ts",
          filename: "settlement.ts",
          code: `await client.settlement.accounts.create(input);
await client.settlement.accounts.list();
await client.settlement.accounts.getDefault();
await client.settlement.accounts.get(accountId);
await client.settlement.accounts.update(accountId, input);`,
        },
      },
      {
        id: "sdk-server-webhooks",
        title: "Verify webhooks",
        paragraphs: ["Verify the raw request body before trusting a webhook payload."],
        sample: {
          label: "Signature check",
          language: "ts",
          filename: "webhook.ts",
          code: `import {
  renewWebhookHeaderNames,
  verifyRenewWebhookSignature,
} from "@renew.sh/sdk/server";

const valid = verifyRenewWebhookSignature({
  payload: rawBody,
  signingSecret: process.env.RENEW_WEBHOOK_SECRET!,
  signatureHeader: request.headers.get(renewWebhookHeaderNames.signature),
  timestampHeader: request.headers.get(renewWebhookHeaderNames.timestamp),
});`,
        },
      },
    ],
  },
  {
    id: "sdk-checkout",
    category: "sdk",
    group: "Checkout",
    navTitle: "Checkout",
    title: "Checkout",
    description: "Use Renew Checkout as a modal or redirect.",
    sections: [
      {
        id: "sdk-checkout-modal",
        title: "Modal",
        paragraphs: [
          "Modal checkout opens in an iframe over your site.",
        ],
        sample: {
          label: "Modal checkout",
          language: "ts",
          filename: "modal.ts",
          code: `import { checkout } from "@renew.sh/sdk";

checkout.open(collection.checkoutUrl);`,
        },
      },
      {
        id: "sdk-checkout-redirect",
        title: "Redirect",
        paragraphs: ["Redirect mode sends the customer to the hosted checkout page."],
        sample: {
          label: "Redirect checkout",
          language: "ts",
          filename: "redirect.ts",
          code: `import { checkout } from "@renew.sh/sdk";

checkout.open(collection.checkoutUrl, { mode: "redirect" });`,
        },
      },
      {
        id: "sdk-checkout-success",
        title: "Success",
        paragraphs: ["After a confirmed payment, modal checkout shows the success state and closes."],
      },
    ],
  },
  {
    id: "sdk-react",
    category: "sdk",
    group: "Checkout",
    navTitle: "React",
    title: "React checkout",
    description: "Use the React helper when your checkout button lives in React.",
    sections: [
      {
        id: "sdk-react-button",
        title: "Checkout button",
        paragraphs: ["`RenewCheckout` is a small wrapper around `checkout.open(...)`."],
        sample: {
          label: "React button",
          language: "tsx",
          filename: "CheckoutButton.tsx",
          code: `import { RenewCheckout } from "@renew.sh/sdk/react";

export function CheckoutButton({ checkoutUrl }: { checkoutUrl: string }) {
  return <RenewCheckout checkoutUrl={checkoutUrl}>Pay</RenewCheckout>;
}`,
        },
      },
    ],
  },
];

export function isDocsCategoryId(
  value: string | null | undefined,
): value is DocsCategoryId {
  return docsCategories.some((category) => category.id === value);
}

export function getDocsPages(category: DocsCategoryId) {
  const orderedIds = docsPageOrder[category];
  const position = new Map(orderedIds.map((pageId, index) => [pageId, index]));

  return docsPages
    .filter((page) => page.category === category)
    .sort((pageA, pageB) => {
      const indexA = position.get(pageA.id) ?? Number.MAX_SAFE_INTEGER;
      const indexB = position.get(pageB.id) ?? Number.MAX_SAFE_INTEGER;

      return indexA - indexB;
    });
}

export function getDocsPage(pageId: string | null | undefined) {
  return docsPages.find((page) => page.id === pageId) ?? null;
}

export function getDocsCategoryForPage(pageId: string | null | undefined) {
  return getDocsPage(pageId)?.category ?? null;
}
