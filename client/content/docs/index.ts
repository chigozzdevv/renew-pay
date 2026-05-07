export type DocsCategoryId = "api";

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

export const docsCategories: DocsCategory[] = [{ id: "api", label: "API" }];

const docsPageOrder: Record<DocsCategoryId, string[]> = {
  api: [
    "guide-quickstart",
    "guide-collections",
    "guide-settlement",
    "guide-customers",
    "guide-payouts",
    "guide-webhooks",
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
    id: "guide-quickstart",
    category: "api",
    group: "Start here",
    navTitle: "Quickstart",
    title: "Quickstart",
    description: "Create a collection and open checkout.",
    sections: [
      {
        id: "guide-quickstart-flow",
        title: "Flow",
        paragraphs: ["Collections are the money-in object merchants create for orders, invoices, subscriptions, and payment links."],
        steps: [
          "Configure checkout, developers, and settlement in the dashboard.",
          "Create a collection with amount, currency, and reference.",
          "Open the returned `checkoutUrl` with the checkout SDK or redirect the payer to it.",
          "Listen for `collection.paid` before fulfilling the order.",
          "Track collection and settlement status from the dashboard or API.",
        ],
      },
      {
        id: "guide-quickstart-create",
        title: "Create collection",
        paragraphs: ["A collection can be one-time or recurring."],
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
    "recurring": { "enabled": false }
  }'`,
        },
      },
      {
        id: "guide-quickstart-open",
        title: "Open checkout",
        paragraphs: ["Use the browser SDK to open the Renew checkout modal. The hosted URL also works directly for emails, invoices, and no-JS sites."],
        samples: [
          {
            label: "Browser",
            language: "ts",
            filename: "checkout.ts",
            code: `import { checkout } from "@renew.sh/sdk";

await checkout.open(collection.checkoutUrl);`,
          },
          {
            label: "Redirect",
            language: "ts",
            filename: "redirect.ts",
            code: `window.location.href = collection.checkoutUrl;`,
          },
        ],
      },
      {
        id: "guide-quickstart-webhook",
        title: "Fulfill from webhooks",
        paragraphs: ["Browser callbacks are optional UI helpers. Server-side webhook events are the source of truth for fulfillment."],
        sample: {
          label: "Handler",
          language: "ts",
          filename: "webhook.ts",
          code: `if (event.type === "collection.paid") {
  await orders.markPaid(event.data.reference);
}`,
        },
      },
    ],
  },
  {
    id: "guide-collections",
    category: "api",
    group: "Core",
    navTitle: "Collections",
    title: "Collections",
    description: "Create and manage money-in collections.",
    sections: [
      {
        id: "guide-collections-endpoints",
        title: "Endpoints",
        paragraphs: ["Use `reference` to map Renew collections back to your orders."],
        references: [
          { label: "GET", value: "/v1/collections", detail: "List collections." },
          { label: "POST", value: "/v1/collections", detail: "Create a collection." },
          { label: "GET", value: "/v1/collections/:collectionId", detail: "Fetch one collection." },
          { label: "POST", value: "/v1/collections/:collectionId/cancel", detail: "Cancel a collection." },
        ],
      },
      {
        id: "guide-collections-payload",
        title: "Payload",
        paragraphs: ["The server returns a hosted `checkoutUrl`."],
        samples: [
          createJsonSample("Create request", "create-collection.request.json", {
            amount: 25000,
            currency: "NGN",
            reference: "order_1042",
            description: "Order #1042",
            settlement: "default",
            customer: {
              reference: "user_123",
              email: "ada@example.com",
              name: "Ada Okafor",
            },
            recurring: {
              enabled: false,
            },
          }),
          createJsonSample("Create response", "create-collection.response.json", {
            id: "pay_7de830caf3cc49df9f18d8a1",
            reference: "order_1042",
            amount: 25000,
            currency: "NGN",
            description: "Order #1042",
            status: "created",
            checkoutUrl: "https://app.renew.sh/pay/pay_7de830caf3cc49df9f18d8a1",
            customer: {
              reference: "user_123",
              email: "ada@example.com",
              name: "Ada Okafor",
            },
          }),
        ],
      },
    ],
  },
  {
    id: "guide-settlement",
    category: "api",
    group: "Core",
    navTitle: "Settlement",
    title: "Settlement",
    description: "Configure where stable settlement is delivered.",
    sections: [
      {
        id: "guide-settlement-routes",
        title: "Routes",
        paragraphs: ["A collection uses settlement. If none is passed, Renew uses the active default settlement."],
        references: [
          { label: "GET", value: "/v1/settlement/routes", detail: "List routes." },
          { label: "POST", value: "/v1/settlement/routes", detail: "Create a route." },
          { label: "GET", value: "/v1/settlement/routes/default", detail: "Fetch the default route." },
          { label: "PATCH", value: "/v1/settlement/routes/:routeId", detail: "Update a route." },
        ],
      },
      {
        id: "guide-settlement-providers",
        title: "Providers",
        paragraphs: ["Use `direct` for standard SPL settlement and `umbra` for private USDC settlement."],
      },
    ],
  },
  {
    id: "guide-customers",
    category: "api",
    group: "Core",
    navTitle: "Customers",
    title: "Customers",
    description: "Store payer profiles when a merchant wants reusable customer records.",
    sections: [
      {
        id: "guide-customers-endpoints",
        title: "Endpoints",
        paragraphs: ["Renew creates or updates customers from checkout details."],
        references: [
          { label: "GET", value: "/v1/customers", detail: "List customers." },
          { label: "POST", value: "/v1/customers", detail: "Create a customer." },
          { label: "GET", value: "/v1/customers/:customerId", detail: "Fetch one customer." },
          { label: "PATCH", value: "/v1/customers/:customerId", detail: "Update a customer." },
          { label: "POST", value: "/v1/customers/:customerId/blacklist", detail: "Block a customer." },
        ],
      },
    ],
  },
  {
    id: "guide-payouts",
    category: "api",
    group: "Core",
    navTitle: "Payouts",
    title: "Payouts",
    description: "Track and process merchant payouts.",
    sections: [
      {
        id: "guide-payouts-endpoints",
        title: "Endpoints",
        paragraphs: ["Payouts settle merchant balances through the selected settlement provider."],
        references: [
          { label: "GET", value: "/v1/payouts", detail: "List payouts." },
          { label: "POST", value: "/v1/payouts", detail: "Create a payout." },
          { label: "GET", value: "/v1/payouts/:payoutId", detail: "Fetch one payout." },
          { label: "PATCH", value: "/v1/payouts/:payoutId", detail: "Update a payout." },
          { label: "POST", value: "/v1/payouts/:payoutId/process", detail: "Process a payout." },
        ],
      },
    ],
  },
  {
    id: "guide-webhooks",
    category: "api",
    group: "Core",
    navTitle: "Webhooks",
    title: "Webhooks",
    description: "Receive collection, settlement, payout, and customer events.",
    sections: [
      {
        id: "guide-webhooks-endpoints",
        title: "Endpoints",
        paragraphs: ["Configure webhook endpoints from Settings > Developers or API."],
        references: [
          { label: "GET", value: "/v1/developers/webhooks", detail: "List webhooks." },
          { label: "POST", value: "/v1/developers/webhooks", detail: "Create a webhook." },
          { label: "PATCH", value: "/v1/developers/webhooks/:webhookId", detail: "Update a webhook." },
          { label: "POST", value: "/v1/developers/webhooks/:webhookId/test", detail: "Send a test delivery." },
        ],
      },
      {
        id: "guide-webhooks-events",
        title: "Events",
        paragraphs: ["Use collection events for order state and settlement events for payout tracking."],
        bullets: [
          "`collection.created`",
          "`collection.collecting`",
          "`collection.paid`",
          "`collection.failed`",
          "`collection.cancelled`",
          "`settlement.processing`",
          "`settlement.settled`",
          "`settlement.failed`",
        ],
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
