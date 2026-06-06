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
    "api-keys",
    "api-checkout-settings",
    "api-settlement",
    "api-collections",
    "api-webhooks",
    "api-customers",
  ],
  sdk: [
    "sdk-quickstart",
    "sdk-checkout",
    "sdk-server",
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
    title: "Integration flow",
    description: "Set up Renew, create a collection, open checkout, and fulfill from webhooks.",
    sections: [
      {
        id: "api-overview-flow",
        title: "Merchant flow",
        paragraphs: [
          "Renew is organized around collections and settlement. A collection is money you want Renew to collect from a customer. Settlement is how the collected stable value reaches your wallet.",
        ],
        steps: [
          "Create test keys in Settings > Developers.",
          "Set checkout mode, site domains, and return page in Settings > Checkout.",
          "Connect a default Stellar settlement account with the API or dashboard.",
          "Create a collection with amount, currency, and reference.",
          "Open the returned checkout URL with the SDK or redirect the customer to it.",
          "Listen for `collection.paid` before fulfilling the order.",
          "Track Stellar settlement from the dashboard and webhook events.",
        ],
      },
      {
        id: "api-overview-settlement-path",
        title: "Settlement path",
        paragraphs: [
          "After a collection is paid, Renew receives canonical USDC, routes it to Stellar USDC through Circle CCTP, locks it in the settlement vault, and releases it after the payout window.",
        ],
        references: [
          { label: "Asset", value: "USDC", detail: "Native USDC, not a wrapped token." },
          { label: "Network", value: "Stellar", detail: "Merchant settlement wallet and vault release network." },
          { label: "Release", value: "Next day", detail: "Renew can hold settlement before release if a payment issue is reported." },
        ],
      },
      {
        id: "api-overview-objects",
        title: "Core objects",
        paragraphs: ["These are the objects most merchant integrations need."],
        references: [
          { label: "Object", value: "Collection", detail: "Money-in request for an order, invoice, subscription, or link." },
          { label: "Object", value: "Checkout", detail: "Renew-hosted customer payment flow for a collection." },
          { label: "Object", value: "Customer", detail: "Payer profile Renew creates or updates from checkout details." },
          { label: "Object", value: "Settlement", detail: "Stellar USDC release and payout state for collected value." },
        ],
      },
    ],
  },
  {
    id: "api-keys",
    category: "api",
    group: "Start here",
    navTitle: "Keys and modes",
    title: "Keys and modes",
    description: "Use test keys in sandbox and live keys in production.",
    sections: [
      {
        id: "api-keys-create",
        title: "Create keys",
        paragraphs: [
          "Create server keys from Settings > Developers. Test keys start with `rw_test_`; live keys start with `rw_live_`.",
        ],
        steps: [
          "Open Dashboard > Settings > Developers.",
          "Switch to the environment you want.",
          "Create a server key.",
          "Store the full key immediately.",
          "Use it only from your server.",
        ],
      },
      {
        id: "api-keys-hosts",
        title: "API hosts",
        paragraphs: [
          "The API host and server key must match. Renew scopes server API requests to the merchant and environment stored on the key.",
        ],
        references: [
          { label: "Sandbox", value: "https://staging-pay.renew.sh", detail: "Use with `rw_test_` keys." },
          { label: "Live", value: "https://pay.renew.sh", detail: "Use with `rw_live_` keys." },
          { label: "Header", value: "x-renew-secret-key", detail: "Send the server key on API requests." },
        ],
        note: "Do not pass an `environment` field in server API payloads. The server key and host decide sandbox or live.",
      },
      {
        id: "api-keys-request",
        title: "Request example",
        paragraphs: ["Server API calls use the same key header."],
        sample: {
          label: "Authenticated request",
          language: "bash",
          filename: "request.sh",
          code: `curl https://staging-pay.renew.sh/v1/collections \\
  -H "x-renew-secret-key: $RENEW_SECRET_KEY" \\
  -H "Content-Type: application/json"`,
        },
      },
    ],
  },
  {
    id: "api-checkout-settings",
    category: "api",
    group: "Start here",
    navTitle: "Checkout setup",
    title: "Checkout setup",
    description: "Configure how customers enter and leave checkout.",
    sections: [
      {
        id: "api-checkout-settings-dashboard",
        title: "Dashboard settings",
        paragraphs: ["Checkout settings live in Dashboard > Settings > Checkout."],
        references: [
          { label: "Mode", value: "modal | redirect", detail: "Modal opens over the merchant site. Redirect sends the customer to hosted checkout." },
          { label: "Return page", value: "https://merchant.com/checkout/return", detail: "Hosted checkout redirects here after a confirmed successful payment." },
          { label: "Domains", value: "merchant.com", detail: "Site domains your team uses for modal checkout." },
        ],
      },
      {
        id: "api-checkout-settings-result",
        title: "Success behavior",
        paragraphs: [
          "Modal checkout shows the success animation and closes. Hosted checkout shows the same success state, then redirects to the return page with `collection` and `status` query parameters.",
        ],
        sample: {
          label: "Return page query",
          language: "bash",
          filename: "return-url.txt",
          code: `https://merchant.com/checkout/return?collection=pay_7de830caf3cc49df9f18d8a1&status=paid`,
        },
      },
    ],
  },
  {
    id: "api-collections",
    category: "api",
    group: "Collect",
    navTitle: "Collections",
    title: "Collections API",
    description: "Create and manage money-in collections.",
    sections: [
      {
        id: "api-collections-endpoints",
        title: "Endpoints",
        paragraphs: ["Use these endpoints from your server. Renew scopes each request to the merchant and mode on the server key."],
        references: [
          { label: "POST", value: "/v1/collections", detail: "Create a collection and receive a `checkoutUrl`." },
          { label: "GET", value: "/v1/collections", detail: "List collections for reconciliation and support." },
          { label: "GET", value: "/v1/collections/:collectionId", detail: "Fetch one collection by id." },
          { label: "POST", value: "/v1/collections/:collectionId/cancel", detail: "Cancel an unpaid collection." },
        ],
      },
      {
        id: "api-collections-create",
        title: "Create request",
        paragraphs: [
          "Create a collection from your server when a customer is ready to pay. `reference` should be your order, invoice, subscription, or cart id.",
        ],
        sample: {
          label: "Create collection",
          language: "bash",
          filename: "create-collection.sh",
          code: `curl https://staging-pay.renew.sh/v1/collections \\
  -H "x-renew-secret-key: $RENEW_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 25000,
    "currency": "NGN",
    "reference": "order_1042",
    "description": "Order #1042",
    "settlement": "default",
    "customer": {
      "reference": "user_123",
      "email": "ada@example.com",
      "name": "Ada Okafor"
    }
  }'`,
        },
      },
      {
        id: "api-collections-payload",
        title: "Request shape",
        paragraphs: [
          "`settlement` can be `default`, an account code, or an account id. `customer` is optional and only pre-fills details you already know. Renew still creates or updates the customer from checkout.",
        ],
        references: [
          { label: "Required", value: "amount", detail: "Local amount to collect." },
          { label: "Required", value: "currency", detail: "Local collection currency, for example `NGN`, `KES`, or `GHS`." },
          { label: "Required", value: "reference", detail: "Your internal id for the order or invoice." },
          { label: "Optional", value: "settlement", detail: "`default`, account code, or account id." },
          { label: "Optional", value: "customer", detail: "Known customer reference, email, or name for prefill." },
          { label: "Optional", value: "recurring", detail: "Recurring cadence when the collection is for a subscription." },
        ],
      },
      {
        id: "api-collections-response",
        title: "Create response",
        paragraphs: [
          "Send `checkoutUrl` to the browser SDK or redirect the customer to it.",
        ],
        samples: [
          createJsonSample("Create response", "create-collection.response.json", {
            id: "pay_7de830caf3cc49df9f18d8a1",
            paymentId: "66f1d2c11d0e63b8a1",
            reference: "order_1042",
            amount: 25000,
            currency: "NGN",
            description: "Order #1042",
            status: "created",
            checkoutUrl: "https://app.renew.sh/pay/pay_7de830caf3cc49df9f18d8a1",
            settlement: {
              id: "66f1d2c11d0e63b8a1",
            },
            customer: {
              reference: "user_123",
              email: "ada@example.com",
              name: "Ada Okafor",
            },
          }),
        ],
      },
      {
        id: "api-collections-statuses",
        title: "Statuses",
        paragraphs: ["Use webhook events, not browser callbacks, to move orders through paid and failed states."],
        references: [
          { label: "Status", value: "created", detail: "Collection exists but checkout has not started." },
          { label: "Status", value: "collecting", detail: "Customer is in checkout or bank transfer details have been issued." },
          { label: "Status", value: "paid", detail: "Payment has been confirmed." },
          { label: "Status", value: "failed", detail: "Collection cannot be completed." },
          { label: "Status", value: "cancelled", detail: "Collection was cancelled before payment." },
        ],
      },
    ],
  },
  {
    id: "api-webhooks",
    category: "api",
    group: "Collect",
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
          "Select the test or live environment.",
          "Add your webhook URL.",
          "Choose the collection and settlement events to receive.",
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
    title: "Settlement API",
    description: "Connect the Stellar wallet that receives released settlement.",
    sections: [
      {
        id: "api-settlement-endpoints",
        title: "Endpoints",
        paragraphs: ["Use settlement account endpoints from your server or manage the same account in Dashboard > Settlement."],
        references: [
          { label: "POST", value: "/v1/settlement/accounts", detail: "Create a Stellar settlement account." },
          { label: "GET", value: "/v1/settlement/accounts", detail: "List settlement accounts." },
          { label: "GET", value: "/v1/settlement/accounts/default", detail: "Fetch the active default account." },
          { label: "GET", value: "/v1/settlement/accounts/:accountId", detail: "Fetch one account by id." },
          { label: "PATCH", value: "/v1/settlement/accounts/:accountId", detail: "Update account details, default state, or status." },
        ],
      },
      {
        id: "api-settlement-create",
        title: "Create account",
        paragraphs: [
          "Create one active default account before creating live collections. The wallet must be funded on Stellar and trust Circle USDC before it can receive settlement.",
        ],
        sample: {
          label: "Create settlement account",
          language: "bash",
          filename: "create-settlement-account.sh",
          code: `curl https://staging-pay.renew.sh/v1/settlement/accounts \\
  -H "x-renew-secret-key: $RENEW_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "accountCode": "main-wallet",
    "name": "Main wallet",
    "destinationAddress": "YOUR_STELLAR_WALLET",
    "isDefault": true
  }'`,
        },
      },
      {
        id: "api-settlement-response",
        title: "Account response",
        paragraphs: ["Use the account `id` or `accountCode` when a collection should settle somewhere other than the default account."],
        samples: [
          createJsonSample("Settlement account", "settlement-account.response.json", {
            id: "66f1d2c11d0e63b8a1",
            accountCode: "main-wallet",
            name: "Main wallet",
            assetSymbol: "USDC",
            destinationAddress: "YOUR_STELLAR_WALLET",
            isDefault: true,
            status: "active",
          }),
        ],
      },
      {
        id: "api-settlement-select",
        title: "Use an account",
        paragraphs: [
          "Collections use the default account when `settlement` is omitted or set to `default`. Pass an account code or account id only when that collection needs a specific destination.",
        ],
        sample: {
          label: "Collection settlement",
          language: "json",
          filename: "collection-settlement.json",
          code: JSON.stringify(
            {
              amount: 25000,
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
        id: "api-settlement-release",
        title: "Release window",
        paragraphs: [
          "Confirmed payments route through Circle CCTP to Stellar USDC, enter the settlement vault, and release after the next-day window. If a customer reports an issue before release, Renew can hold settlement for review.",
        ],
      },
      {
        id: "api-settlement-payouts",
        title: "Payouts",
        paragraphs: ["Payouts track vault release for collected value. Use settlement webhooks for automation and Dashboard > Payouts for operations."],
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
          "Merchants do not need to create customers before checkout. Pass `customer.reference`, `customer.email`, or `customer.name` only when you already have them.",
        ],
      },
      {
        id: "api-customers-dashboard",
        title: "Dashboard",
        paragraphs: ["Use the Customers page for support, history, and risk workflows."],
        references: [
          { label: "Dashboard", value: "Customers", detail: "Search customers, inspect collection history, and handle support or risk actions." },
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
        id: "sdk-quickstart-settlement",
        title: "One-time setup",
        paragraphs: [
          "Create a default Stellar settlement account once from the dashboard or server SDK. Renew routes collected value to Stellar USDC through CCTP before vault release.",
        ],
        sample: {
          label: "Create default account",
          language: "ts",
          filename: "setup.ts",
          code: `import { renew } from "@renew.sh/sdk";

const client = renew({
  secretKey: process.env.RENEW_SECRET_KEY!,
});

await client.settlement.accounts.create({
  accountCode: "main-wallet",
  name: "Main wallet",
  destinationAddress: process.env.SETTLEMENT_WALLET!,
  isDefault: true,
});`,
        },
      },
      {
        id: "sdk-quickstart-server",
        title: "Server checkout",
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
        title: "Checkout button",
        paragraphs: ["The browser never sees the server key. It asks your server for a checkout URL, then opens Renew checkout."],
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

    await checkout.open(collection.checkoutUrl);
  }

  return <button onClick={pay}>Pay</button>;
}`,
        },
      },
    ],
  },
  {
    id: "sdk-checkout",
    category: "sdk",
    group: "Checkout",
    navTitle: "Checkout SDK",
    title: "Checkout SDK",
    description: "Use Renew-hosted checkout as a modal or redirect.",
    sections: [
      {
        id: "sdk-checkout-modal",
        title: "Modal mode",
        paragraphs: [
          "Modal mode opens Renew checkout in an iframe over the merchant site. Renew controls the payment UI, success animation, and close message.",
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
        title: "Redirect mode",
        paragraphs: ["Redirect mode sends the customer to the hosted checkout URL."],
        sample: {
          label: "Redirect checkout",
          language: "ts",
          filename: "redirect.ts",
          code: `import { checkout } from "@renew.sh/sdk";

checkout.open(collection.checkoutUrl, { mode: "redirect" });`,
        },
      },
      {
        id: "sdk-checkout-close",
        title: "Success close",
        paragraphs: ["After a confirmed successful payment, modal checkout shows the animated success state and closes itself."],
      },
    ],
  },
  {
    id: "sdk-server",
    category: "sdk",
    group: "Server",
    navTitle: "Server SDK",
    title: "Server SDK",
    description: "Use the server SDK for collections and webhook verification.",
    sections: [
      {
        id: "sdk-server-collections",
        title: "Collections",
        paragraphs: ["The server SDK wraps the collections API and sends the server key header for you."],
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
        paragraphs: ["Use settlement account methods for setup and account management."],
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
        paragraphs: ["Verify the raw request body before trusting the payload."],
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
