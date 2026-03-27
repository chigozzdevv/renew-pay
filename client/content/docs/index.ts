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
    "guide-quickstart",
    "guide-auth",
    "guide-checkout",
    "guide-plans",
    "guide-customers",
    "guide-subscriptions",
    "guide-renewals",
    "guide-webhooks",
  ],
  sdk: ["sdk-overview", "sdk-server", "sdk-react", "sdk-core"],
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
    description:
      "Create a sandbox checkout session and complete a test payment end to end.",
    sections: [
      {
        id: "guide-quickstart-modes",
        title: "Integration modes",
        paragraphs: [
          "Renew has two public environments. Start in sandbox, then move to live when your integration is ready.",
        ],
        sample: {
          label: "Sandbox and live",
          language: "bash",
          filename: "integration-modes.sh",
          code: `# Sandbox
API_ORIGIN=https://sandbox.renew.sh
SERVER_KEY_PREFIX=rw_test_

# Live
API_ORIGIN=https://api.renew.sh
SERVER_KEY_PREFIX=rw_live_`,
        },
      },
      {
        id: "guide-quickstart-flow",
        title: "Starting with sandbox",
        paragraphs: [
          "The shortest path is:",
        ],
        steps: [
          "Create an account.",
          "Add your treasury wallet.",
          "Enable governance only if your treasury needs shared approvals.",
          "Create a plan in the workspace.",
          "Create an `rw_test_` key in the Developers page.",
          "Use the key to list plans and create a session.",
          "Optionally quote a market.",
          "Submit the customer payload.",
          "Complete the sandbox payment.",
        ],
        references: [
          {
            label: "GET",
            value: "/v1/checkout/plans",
            detail: "List active checkout-ready plans for the current server key.",
          },
          {
            label: "POST",
            value: "/v1/checkout/sessions",
            detail: "Create a checkout session from a plan.",
          },
          {
            label: "GET",
            value: "/v1/checkout/sessions/:sessionId/quote?market=NGN",
            detail: "Quote one supported billing market before submission.",
          },
          {
            label: "POST",
            value: "/v1/checkout/sessions/:sessionId/customer",
            detail: "Submit customer identity and payment routing.",
          },
          {
            label: "POST",
            value: "/v1/checkout/sessions/:sessionId/test-complete",
            detail: "Complete a pending sandbox payment.",
          },
        ],
        samples: [
          createJsonSample("Create session request", "create-session.request.json", {
            method: "POST",
            url: "https://sandbox.renew.sh/v1/checkout/sessions",
            headers: {
              "x-renew-secret-key": "rw_test_xxxxxxxxxxxxxxxxxxxxxxxx",
              "content-type": "application/json",
            },
            body: {
              planId: "64f8c8a8f1d2c11d0e63b6a3",
              expiresInMinutes: 30,
            },
          }),
          createJsonSample("Create session response", "create-session.response.json", {
            success: true,
            message: "Checkout session created.",
            data: {
              clientSecret: "rcs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
              session: {
                id: "64f8d430f1d2c11d0e63ba13",
                environment: "sandbox",
                status: "open",
                nextAction: "submit_customer",
                expiresAt: "2026-03-09T12:30:00.000Z",
                testMode: {
                  enabled: true,
                  canCompletePayment: false,
                },
              },
            },
          }),
        ],
      },
    ],
  },
  {
    id: "guide-auth",
    category: "api",
    group: "Start here",
    navTitle: "Authentication",
    title: "Authentication",
    description:
      "Use the right credential for the right surface and keep sandbox and live traffic separate.",
    sections: [
      {
        id: "guide-auth-types",
        title: "Credential types",
        paragraphs: [
          "Most auth errors come from sending the right token to the wrong endpoint.",
        ],
        bullets: [
          "Workspace APIs use `Authorization: Bearer <jwt>`.",
          "Backend checkout calls use a Renew server key: `rw_test_...` for sandbox or `rw_live_...` for live.",
          "Customer checkout calls use a checkout client secret that starts with `rcs_`.",
        ],
      },
      {
        id: "guide-auth-environments",
        title: "Origins and headers",
        paragraphs: [
          "Server keys and client secrets can be sent in explicit Renew headers or as bearer tokens.",
        ],
        references: [
          {
            label: "Sandbox",
            value: "https://sandbox.renew.sh",
            detail: "Use with `rw_test_` keys and sandbox checkout traffic.",
          },
          {
            label: "Live",
            value: "https://api.renew.sh",
            detail: "Use with `rw_live_` keys and live traffic.",
          },
          {
            label: "Header",
            value: "x-renew-secret-key",
            detail: "Preferred header for backend checkout calls.",
          },
          {
            label: "Header",
            value: "x-renew-client-secret",
            detail: "Preferred header for customer session calls.",
          },
        ],
      },
    ],
  },
  {
    id: "guide-checkout",
    category: "api",
    group: "Start here",
    navTitle: "Checkout flow",
    title: "Checkout flow",
    description:
      "Move a customer from plan selection to a billed subscription record.",
    sections: [
      {
        id: "guide-checkout-flow",
        title: "Flow",
        paragraphs: [
          "The checkout flow is shown below. Adapt it to your use case.",
        ],
        steps: [
          "Your application backend calls `GET /v1/checkout/plans` with `x-renew-secret-key`.",
          "Your application backend calls `POST /v1/checkout/sessions` with the selected `planId`.",
          "The frontend or hosted customer step calls `GET /v1/checkout/sessions/:sessionId` with `x-renew-client-secret`.",
          "Optionally call `GET /v1/checkout/sessions/:sessionId/quote?market=NGN` before customer submission.",
          "Call `POST /v1/checkout/sessions/:sessionId/customer` to submit customer and payment routing fields.",
          "Read the session again and wait for the next action or charge progress.",
          "In sandbox, call `POST /v1/checkout/sessions/:sessionId/test-complete` when the session is ready for test completion.",
        ],
        references: [
          {
            label: "GET",
            value: "/v1/checkout/plans",
            detail: "List active checkout-ready plans.",
          },
          {
            label: "POST",
            value: "/v1/checkout/sessions",
            detail: "Create a checkout session with `planId`.",
          },
          {
            label: "GET",
            value: "/v1/checkout/sessions/:sessionId",
            detail: "Read the latest session state.",
          },
          {
            label: "GET",
            value: "/v1/checkout/sessions/:sessionId/quote?market=NGN",
            detail: "Quote a supported market for that session.",
          },
          {
            label: "POST",
            value: "/v1/checkout/sessions/:sessionId/customer",
            detail: "Submit customer and payment routing fields.",
          },
          {
            label: "POST",
            value: "/v1/checkout/sessions/:sessionId/test-complete",
            detail: "Available only in sandbox mode.",
          },
        ],
        samples: [
          {
            label: "List plans request",
            language: "bash",
            code: `curl https://sandbox.renew.sh/v1/checkout/plans \\
  -H "x-renew-secret-key: rw_test_xxxxxxxxxxxxxxxxxxxxxxxx"`,
          },
          createJsonSample("List plans response", "list-plans.response.json", {
            success: true,
            data: [
              {
                id: "64f8c8a8f1d2c11d0e63b6a3",
                planCode: "PRO_MONTHLY",
                name: "Pro Monthly",
                usdAmount: 99,
                usageRate: null,
                billingIntervalDays: 30,
                trialDays: 7,
                retryWindowHours: 24,
                billingMode: "fixed",
                supportedMarkets: ["NGN", "KES"],
              },
            ],
          }),
          createJsonSample("Create session request", "create-session.request.json", {
            method: "POST",
            path: "/v1/checkout/sessions",
            headers: {
              "x-renew-secret-key": "rw_test_xxxxxxxxxxxxxxxxxxxxxxxx",
              "content-type": "application/json",
            },
            body: {
              planId: "64f8c8a8f1d2c11d0e63b6a3",
              expiresInMinutes: 30,
            },
          }),
          createJsonSample("Create session response", "create-session.response.json", {
            success: true,
            message: "Checkout session created.",
            data: {
              clientSecret: "rcs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
              session: {
                id: "64f8d430f1d2c11d0e63ba13",
                environment: "sandbox",
                status: "open",
                nextAction: "submit_customer",
                expiresAt: "2026-03-09T12:30:00.000Z",
              },
            },
          }),
          createJsonSample("Submit customer request", "submit-customer.request.json", {
            method: "POST",
            path: "/v1/checkout/sessions/64f8d430f1d2c11d0e63ba13/customer",
            headers: {
              "x-renew-client-secret":
                "rcs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
              "content-type": "application/json",
            },
            body: {
              name: "Ngozi Okafor",
              email: "ngozi@example.com",
              market: "NGN",
              paymentAccountType: "bank",
              paymentAccountNumber: "0123456789",
              paymentNetworkId: "nibss-ngn",
            },
          }),
          createJsonSample("Submit customer response", "submit-customer.response.json", {
            success: true,
            message: "Checkout customer submitted.",
            data: {
              id: "64f8d430f1d2c11d0e63ba13",
              environment: "sandbox",
              status: "scheduled",
              nextAction: "wait_for_charge",
              customer: {
                name: "Ngozi Okafor",
                email: "ngozi@example.com",
                market: "NGN",
                paymentAccountType: "bank",
                paymentAccountNumber: "0123456789",
                paymentNetworkId: "nibss-ngn",
              },
              testMode: {
                enabled: true,
                canCompletePayment: false,
              },
            },
          }),
        ],
      },
      {
        id: "guide-checkout-lifecycle",
        title: "Session states",
        paragraphs: [
          "These are the public statuses your UI should handle.",
        ],
        bullets: [
          "`open`: waiting for customer details.",
          "`scheduled`: customer submitted and a subscription exists.",
          "`pending_payment`: a provider payment is waiting to complete.",
          "`processing`: settlement is still in progress.",
          "`settled`: the checkout payment completed.",
          "`failed` or `expired`: start a fresh session.",
        ],
        note:
          "For sandbox sessions, `nextAction` becomes `complete_test_payment` when the session is ready for test completion.",
      },
    ],
  },
  {
    id: "guide-customers",
    category: "api",
    group: "Billing operations",
    navTitle: "Customers",
    title: "Customers",
    description:
      "Track billing identities and control customer status from the workspace API.",
    sections: [
      {
        id: "guide-customers-overview",
        title: "Customer flow",
        paragraphs: [
          "Customer records hold the billing identity behind plans, subscriptions, and charges.",
        ],
        steps: [
          "List the customer directory.",
          "Create the customer record.",
          "Update billing or payment method state when it changes.",
          "Use the explicit action endpoints to pause, resume, or blacklist the customer.",
        ],
      },
      {
        id: "guide-customers-endpoints",
        title: "Endpoints",
        paragraphs: [
          "In signed-in workspace calls, `merchantId` is resolved from the JWT session. Use the `environment` field or query parameter when you need sandbox or live data explicitly.",
        ],
        references: [
          {
            label: "GET",
            value: "/v1/customers",
            detail: "List customers by status, market, or search.",
          },
          {
            label: "POST",
            value: "/v1/customers",
            detail: "Create a customer record.",
          },
          {
            label: "GET",
            value: "/v1/customers/:customerId",
            detail: "Fetch one customer.",
          },
          {
            label: "PATCH",
            value: "/v1/customers/:customerId",
            detail: "Update editable customer fields.",
          },
          {
            label: "POST",
            value: "/v1/customers/:customerId/pause",
            detail: "Pause billing.",
          },
          {
            label: "POST",
            value: "/v1/customers/:customerId/resume",
            detail: "Resume billing.",
          },
          {
            label: "POST",
            value: "/v1/customers/:customerId/blacklist",
            detail: "Block future billing activity.",
          },
        ],
        samples: [
          createJsonSample("Create customer request", "create-customer.request.json", {
            method: "POST",
            path: "/v1/customers",
            headers: {
              Authorization: "Bearer {{RENEW_JWT}}",
              "content-type": "application/json",
            },
            body: {
              environment: "sandbox",
              customerRef: "cust_ngozi_001",
              name: "Ngozi Foods",
              email: "billing@ngozi.example",
              market: "NGN",
              metadata: {
                segment: "growth",
              },
            },
          }),
          createJsonSample("Create customer response", "create-customer.response.json", {
            success: true,
            message: "Customer created.",
            data: {
              id: "64f8c9d0f1d2c11d0e63b754",
              merchantId: "64f8c60af1d2c11d0e63b531",
              customerRef: "cust_ngozi_001",
              name: "Ngozi Foods",
              email: "billing@ngozi.example",
              market: "NGN",
              status: "active",
              billingState: "healthy",
              paymentMethodState: "ok",
              subscriptionCount: 0,
              monthlyVolumeUsdc: 0,
              nextRenewalAt: null,
              lastChargeAt: null,
              autoReminderEnabled: true,
              blacklistedAt: null,
              blacklistReason: null,
              metadata: {
                segment: "growth",
              },
              createdAt: "2026-03-09T10:00:00.000Z",
              updatedAt: "2026-03-09T10:00:00.000Z",
            },
          }),
          createJsonSample("Update customer request", "update-customer.request.json", {
            method: "PATCH",
            path: "/v1/customers/64f8c9d0f1d2c11d0e63b754",
            headers: {
              Authorization: "Bearer {{RENEW_JWT}}",
              "content-type": "application/json",
            },
            body: {
              billingState: "at_risk",
              paymentMethodState: "update_needed",
            },
          }),
          createJsonSample("Update customer response", "update-customer.response.json", {
            success: true,
            message: "Customer updated.",
            data: {
              id: "64f8c9d0f1d2c11d0e63b754",
              merchantId: "64f8c60af1d2c11d0e63b531",
              customerRef: "cust_ngozi_001",
              name: "Ngozi Foods",
              email: "billing@ngozi.example",
              market: "NGN",
              status: "active",
              billingState: "at_risk",
              paymentMethodState: "update_needed",
              subscriptionCount: 0,
              monthlyVolumeUsdc: 0,
              nextRenewalAt: null,
              lastChargeAt: null,
              autoReminderEnabled: true,
              blacklistedAt: null,
              blacklistReason: null,
              metadata: {
                segment: "growth",
              },
              createdAt: "2026-03-09T10:00:00.000Z",
              updatedAt: "2026-03-09T10:10:00.000Z",
            },
          }),
        ],
      },
    ],
  },
  {
    id: "guide-plans",
    category: "api",
    group: "Billing operations",
    navTitle: "Plans",
    title: "Plans",
    description:
      "Define the catalog checkout can sell.",
    sections: [
      {
        id: "guide-plans-rules",
        title: "Plan flow",
        paragraphs: [
          "Plans define price, interval, billing mode, trial period, retry window, and supported markets.",
        ],
        steps: [
          "Create the plan in `draft`.",
          "Review pricing, interval, and `supportedMarkets`.",
          "Update the plan when pricing or availability changes.",
          "Move the plan to `active` when you want checkout to surface it.",
          "Wait until the plan is synced before relying on checkout.",
        ],
      },
      {
        id: "guide-plans-endpoints",
        title: "Endpoints",
        paragraphs: [
          "Create and manage plans through the workspace API.",
        ],
        references: [
          {
            label: "GET",
            value: "/v1/plans",
            detail: "List plans.",
          },
          {
            label: "POST",
            value: "/v1/plans",
            detail: "Create a plan.",
          },
          {
            label: "GET",
            value: "/v1/plans/:planId",
            detail: "Fetch one plan.",
          },
          {
            label: "PATCH",
            value: "/v1/plans/:planId",
            detail: "Update pricing, status, or markets.",
          },
        ],
        samples: [
          createJsonSample("Create plan request", "create-plan.request.json", {
            method: "POST",
            path: "/v1/plans",
            headers: {
              Authorization: "Bearer {{RENEW_JWT}}",
              "content-type": "application/json",
            },
            body: {
              environment: "sandbox",
              planCode: "PRO_MONTHLY",
              name: "Pro Monthly",
              usdAmount: 99,
              billingIntervalDays: 30,
              trialDays: 7,
              retryWindowHours: 24,
              billingMode: "fixed",
              supportedMarkets: ["NGN", "KES"],
              status: "draft",
            },
          }),
          createJsonSample("Create plan response", "create-plan.response.json", {
            success: true,
            message: "Plan created.",
            data: {
              id: "64f8c8a8f1d2c11d0e63b6a3",
              merchantId: "64f8c60af1d2c11d0e63b531",
              planCode: "PRO_MONTHLY",
              name: "Pro Monthly",
              usdAmount: 99,
              usageRate: null,
              billingIntervalDays: 30,
              trialDays: 7,
              retryWindowHours: 24,
              billingMode: "fixed",
              supportedMarkets: ["NGN", "KES"],
              status: "draft",
              pendingStatus: null,
              onchain: {
                id: null,
                status: "not_synced",
                operationId: null,
                txHash: null,
              },
              createdAt: "2026-03-09T10:00:00.000Z",
              updatedAt: "2026-03-09T10:00:00.000Z",
            },
          }),
          createJsonSample("Activate plan request", "activate-plan.request.json", {
            method: "PATCH",
            path: "/v1/plans/64f8c8a8f1d2c11d0e63b6a3",
            headers: {
              Authorization: "Bearer {{RENEW_JWT}}",
              "content-type": "application/json",
            },
            body: {
              status: "active",
            },
          }),
          createJsonSample("Activate plan response", "activate-plan.response.json", {
            success: true,
            message: "Plan updated.",
            data: {
              id: "64f8c8a8f1d2c11d0e63b6a3",
              merchantId: "64f8c60af1d2c11d0e63b531",
              planCode: "PRO_MONTHLY",
              name: "Pro Monthly",
              usdAmount: 99,
              usageRate: null,
              billingIntervalDays: 30,
              trialDays: 7,
              retryWindowHours: 24,
              billingMode: "fixed",
              supportedMarkets: ["NGN", "KES"],
              status: "draft",
              pendingStatus: "active",
              onchain: {
                id: null,
                status: "pending_activation",
                operationId: "64f8ca10f1d2c11d0e63b820",
                txHash: null,
              },
              createdAt: "2026-03-09T10:00:00.000Z",
              updatedAt: "2026-03-09T10:12:00.000Z",
            },
          }),
        ],
      },
    ],
  },
  {
    id: "guide-subscriptions",
    category: "api",
    group: "Billing operations",
    navTitle: "Subscriptions",
    title: "Subscriptions",
    description:
      "Manage the billing snapshot Renew uses for future charges.",
    sections: [
      {
        id: "guide-subscriptions-overview",
        title: "Subscription flow",
        paragraphs: [
          "A subscription connects one customer to one plan and stores the billing snapshot Renew uses for future charges.",
        ],
        steps: [
          "Make sure the plan is active and synced.",
          "Create the subscription from the workspace API or during checkout.",
          "Read or update the subscription when timing or payment routing changes.",
          "Queue the next charge when you want Renew to run billing.",
        ],
      },
      {
        id: "guide-subscriptions-endpoints",
        title: "Endpoints",
        paragraphs: [
          "Direct subscription creation is useful for imports, migrations, or operator-led billing flows. Checkout-created subscriptions can exist before settlement fully completes, so read the latest status instead of assuming they are already active.",
        ],
        references: [
          {
            label: "GET",
            value: "/v1/subscriptions",
            detail: "List subscriptions.",
          },
          {
            label: "POST",
            value: "/v1/subscriptions",
            detail: "Create a subscription directly.",
          },
          {
            label: "GET",
            value: "/v1/subscriptions/:subscriptionId",
            detail: "Fetch one subscription.",
          },
          {
            label: "PATCH",
            value: "/v1/subscriptions/:subscriptionId",
            detail: "Update status, timing, amount, or payment routing.",
          },
          {
            label: "POST",
            value: "/v1/subscriptions/:subscriptionId/queue-charge",
            detail: "Trigger the next charge attempt.",
          },
        ],
        samples: [
          createJsonSample("Create subscription request", "create-subscription.request.json", {
            method: "POST",
            path: "/v1/subscriptions",
            headers: {
              Authorization: "Bearer {{RENEW_JWT}}",
              "content-type": "application/json",
            },
            body: {
              environment: "sandbox",
              planId: "64f8c8a8f1d2c11d0e63b6a3",
              customerRef: "cust_ngozi_001",
              customerName: "Ngozi Foods",
              billingCurrency: "NGN",
              paymentAccountType: "bank",
              paymentAccountNumber: "0123456789",
              paymentNetworkId: "nibss-ngn",
              status: "active",
              nextChargeAt: "2026-03-16T08:00:00.000Z",
            },
          }),
          createJsonSample("Create subscription response", "create-subscription.response.json", {
            success: true,
            message: "Subscription created.",
            data: {
              id: "64f8c9a0f1d2c11d0e63b741",
              merchantId: "64f8c60af1d2c11d0e63b531",
              planId: "64f8c8a8f1d2c11d0e63b6a3",
              customerRef: "cust_ngozi_001",
              customerName: "Ngozi Foods",
              billingCurrency: "NGN",
              localAmount: 154000,
              paymentAccountType: "bank",
              paymentAccountNumber: "0123456789",
              paymentNetworkId: "nibss-ngn",
              status: "pending_activation",
              pendingStatus: "active",
              nextChargeAt: "2026-03-16T08:00:00.000Z",
              lastChargeAt: null,
              retryAvailableAt: null,
              onchain: {
                id: null,
                status: "pending_activation",
                operationId: "64f8ca60f1d2c11d0e63b840",
                txHash: null,
              },
              createdAt: "2026-03-09T10:20:00.000Z",
              updatedAt: "2026-03-09T10:20:00.000Z",
            },
          }),
          createJsonSample("Update subscription request", "update-subscription.request.json", {
            method: "PATCH",
            path: "/v1/subscriptions/64f8c9a0f1d2c11d0e63b741",
            headers: {
              Authorization: "Bearer {{RENEW_JWT}}",
              "content-type": "application/json",
            },
            body: {
              nextChargeAt: "2026-03-18T08:00:00.000Z",
            },
          }),
          createJsonSample("Update subscription response", "update-subscription.response.json", {
            success: true,
            message: "Subscription updated.",
            data: {
              id: "64f8c9a0f1d2c11d0e63b741",
              merchantId: "64f8c60af1d2c11d0e63b531",
              planId: "64f8c8a8f1d2c11d0e63b6a3",
              customerRef: "cust_ngozi_001",
              customerName: "Ngozi Foods",
              billingCurrency: "NGN",
              localAmount: 154000,
              paymentAccountType: "bank",
              paymentAccountNumber: "0123456789",
              paymentNetworkId: "nibss-ngn",
              status: "active",
              pendingStatus: null,
              nextChargeAt: "2026-03-18T08:00:00.000Z",
              lastChargeAt: null,
              retryAvailableAt: null,
              onchain: {
                id: "301",
                status: "synced",
                operationId: null,
                txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
              },
              createdAt: "2026-03-09T10:20:00.000Z",
              updatedAt: "2026-03-09T10:30:00.000Z",
            },
          }),
        ],
      },
    ],
  },
  {
    id: "guide-renewals",
    category: "api",
    group: "Billing operations",
    navTitle: "Charges & renewals",
    title: "Charges & renewals",
    description:
      "Queue renewals, inspect charges, and retry failed billing attempts.",
    sections: [
      {
        id: "guide-renewals-overview",
        title: "Renewal flow",
        paragraphs: [
          "Use the subscription queue endpoint when you want Renew to drive the next billing attempt from an existing subscription.",
        ],
        steps: [
          "Queue the next charge from the subscription.",
          "Read the charge record to inspect amount, FX, fees, and status.",
          "Retry a failed charge when you are ready to run billing again.",
        ],
      },
      {
        id: "guide-renewals-endpoints",
        title: "Endpoints",
        paragraphs: [
          "Charge endpoints are mainly operational tools once a billing attempt exists. In live mode, direct charge creation and retry are gated by KYB approval.",
        ],
        references: [
          {
            label: "POST",
            value: "/v1/subscriptions/:subscriptionId/queue-charge",
            detail: "Queue the next subscription charge.",
          },
          {
            label: "GET",
            value: "/v1/charges",
            detail: "List charges.",
          },
          {
            label: "POST",
            value: "/v1/charges",
            detail: "Record a charge directly.",
          },
          {
            label: "GET",
            value: "/v1/charges/:chargeId",
            detail: "Fetch one charge.",
          },
          {
            label: "PATCH",
            value: "/v1/charges/:chargeId",
            detail: "Update a charge status or failure code.",
          },
          {
            label: "POST",
            value: "/v1/charges/:chargeId/retry",
            detail: "Retry a failed charge.",
          },
        ],
        samples: [
          createJsonSample("Queue charge request", "queue-charge.request.json", {
            method: "POST",
            path: "/v1/subscriptions/64f8c9a0f1d2c11d0e63b741/queue-charge",
            headers: {
              Authorization: "Bearer {{RENEW_JWT}}",
            },
          }),
          createJsonSample("Queue charge response", "queue-charge.response.json", {
            success: true,
            message: "Subscription charge queued.",
            data: {
              queued: true,
              subscriptionId: "64f8c9a0f1d2c11d0e63b741",
            },
          }),
          createJsonSample("Charge response", "charge.response.json", {
            success: true,
            data: {
              id: "64f8cae4f1d2c11d0e63b8a1",
              merchantId: "64f8c60af1d2c11d0e63b531",
              subscriptionId: "64f8c9a0f1d2c11d0e63b741",
              externalChargeId: "yc_seq_1741512000",
              settlementSource: null,
              localAmount: 154000,
              fxRate: 1555.55,
              usdcAmount: 99,
              feeAmount: 1.5,
              status: "pending",
              failureCode: null,
              onchain: {
                id: null,
                status: "not_synced",
                txHash: null,
              },
              processedAt: "2026-03-09T10:40:00.000Z",
              createdAt: "2026-03-09T10:40:00.000Z",
              updatedAt: "2026-03-09T10:40:00.000Z",
            },
          }),
        ],
      },
    ],
  },
  {
    id: "guide-webhooks",
    category: "api",
    group: "Integrations",
    navTitle: "Webhooks",
    title: "Webhooks",
    description:
      "Receive charge outcomes in your systems and inspect delivery attempts.",
    sections: [
      {
        id: "guide-webhooks-overview",
        title: "Webhook flow",
        paragraphs: [
          "Renew sends webhook events for charge outcomes. Verify every delivery before you trust the payload.",
        ],
        steps: [
          "Create the webhook endpoint from the workspace.",
          "Store the returned secret immediately.",
          "Verify `x-renew-signature` and `x-renew-timestamp` on every delivery.",
          "Send a test delivery before you rely on production events.",
          "Inspect delivery logs if your consumer looks out of sync.",
        ],
        bullets: [
          "Current event types: `charge.settled` and `charge.failed`.",
        ],
        sample: {
          label: "Verify a webhook",
          language: "ts",
          filename: "verify-renew-webhook.ts",
          code: `import {
  renewWebhookHeaderNames,
  verifyRenewWebhookSignature,
} from "@renew.sh/sdk/server";

const isValid = verifyRenewWebhookSignature({
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
    id: "sdk-overview",
    category: "sdk",
    group: "Getting started",
    navTitle: "Overview",
    title: "SDK overview",
    description:
      "Checkout, webhook, and contract helpers for server and React apps.",
    sections: [
      {
        id: "sdk-overview-packages",
        title: "Package surfaces",
        paragraphs: [
          "The SDK is split by use case.",
        ],
        references: [
          {
            label: "Package",
            value: "@renew.sh/sdk",
            detail: "Checkout client, contract clients, events, and shared types.",
          },
          {
            label: "Package",
            value: "@renew.sh/sdk/server",
            detail: "Server checkout helpers and webhook utilities.",
          },
          {
            label: "Package",
            value: "@renew.sh/sdk/react",
            detail: "React checkout modal and session hook.",
          },
        ],
      },
      {
        id: "sdk-overview-environments",
        title: "Environment model",
        paragraphs: [
          "The SDK uses the same public environment names as the docs: `sandbox` and `live`.",
        ],
        bullets: [
          "`sandbox` resolves to `https://sandbox.renew.sh`.",
          "`live` resolves to `https://api.renew.sh`.",
          "`rw_test_` keys map to sandbox and `rw_live_` keys map to live.",
        ],
      },
      {
        id: "sdk-overview-example",
        title: "Server client example",
        paragraphs: [
          "Use the server client when your backend already has the server key.",
        ],
        sample: {
          label: "Server checkout helper",
          language: "ts",
          filename: "renew-server.ts",
          code: `import { createRenewServerClient } from "@renew.sh/sdk/server";

const renew = createRenewServerClient({
  environment: "sandbox",
  secretKey: process.env.RENEW_SECRET_KEY!,
});

const plans = await renew.listCheckoutPlans();

const { clientSecret, session } = await renew.createCheckoutSession({
  planId: plans[0].id,
});`,
        },
      },
    ],
  },
  {
    id: "sdk-server",
    category: "sdk",
    group: "Getting started",
    navTitle: "Server SDK",
    title: "Server checkout & webhooks",
    description: "Backend helpers for session creation and signature verification.",
    sections: [
      {
        id: "sdk-server-install",
        title: "Installation",
        paragraphs: [
          "Install the main package, then import from the `/server` subpath.",
        ],
        sample: {
          label: "Install",
          language: "bash",
          filename: "Terminal",
          code: "npm install @renew.sh/sdk",
        },
      },
      {
        id: "sdk-server-checkout",
        title: "Creating checkout sessions",
        paragraphs: [
          "Use the server client to fetch plans and spawn checkout sessions securely with your secret key.",
        ],
        sample: {
          label: "Server checkout",
          language: "ts",
          filename: "renew.ts",
          code: `import { createRenewServerClient } from "@renew.sh/sdk/server";

const renew = createRenewServerClient({
  environment: "sandbox", // or "live"
  secretKey: process.env.RENEW_SECRET_KEY!,
});

// 1. Fetch available plans
const plans = await renew.listCheckoutPlans();

// 2. Create a session for the user
const { session, clientSecret } = await renew.createCheckoutSession({
  planId: plans[0].id,
  metadata: { userId: "user_123" }
});`,
        },
      },
      {
        id: "sdk-server-webhooks",
        title: "Verifying webhooks",
        paragraphs: [
          "The server SDK includes helpers to validate incoming webhook payload signatures.",
        ],
        sample: {
          label: "Webhook signature verification",
          language: "ts",
          filename: "webhook.ts",
          code: `import {
  renewWebhookHeaderNames,
  verifyRenewWebhookSignature,
} from "@renew.sh/sdk/server";

const isValid = verifyRenewWebhookSignature({
  payload: rawBody, // The unparsed string body
  signingSecret: process.env.RENEW_WEBHOOK_SECRET!,
  signatureHeader: request.headers.get(renewWebhookHeaderNames.signature),
  timestampHeader: request.headers.get(renewWebhookHeaderNames.timestamp),
});

if (!isValid) {
  throw new Error("Invalid signature");
}`,
        },
      },
    ],
  },
  {
    id: "sdk-react",
    category: "sdk",
    group: "Getting started",
    navTitle: "React SDK",
    title: "React components & hooks",
    description: "Drop-in UI components and React tracking hooks.",
    sections: [
      {
        id: "sdk-react-modal",
        title: "Checkout Modal",
        paragraphs: [
          "The `RenewCheckoutModal` provides a full, unbranded checkout flow. Simply pass the `clientSecret` from your backend.",
        ],
        sample: {
          label: "Checkout Modal Example",
          language: "tsx",
          filename: "CheckoutButton.tsx",
          code: `import { useState } from "react";
import { RenewCheckoutModal } from "@renew.sh/sdk/react";

export function CheckoutButton({ clientSecret }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Subscribe</button>

      {open && (
        <RenewCheckoutModal
          clientSecret={clientSecret}
          environment="sandbox" // or "live"
          onClose={() => setOpen(false)}
          onSuccess={() => console.log("Payment completed!")}
        />
      )}
    </>
  );
}`,
        },
      },
      {
        id: "sdk-react-hooks",
        title: "Client-side tracking",
        paragraphs: [
          "Use the `useRenewCheckoutSession` hook if you need to build a custom UI but still want to poll for session status updates.",
        ],
        sample: {
          label: "Session hook",
          language: "tsx",
          filename: "CustomCheckout.tsx",
          code: `import { useRenewCheckoutSession } from "@renew.sh/sdk/react";

export function CustomCheckout({ clientSecret }) {
  const { session, quote, submitCustomerData } = useRenewCheckoutSession({
    environment: "sandbox",
    clientSecret,
    onSettled: () => alert("Payment successful!"),
  });

  if (!session) return <p>Loading...</p>;

  return <div>Status: {session.status}</div>;
}`,
        },
      },
    ],
  },
  {
    id: "sdk-core",
    category: "sdk",
    group: "Getting started",
    navTitle: "Clients, events, and types",
    title: "SDK exports",
    description:
      "What the SDK exports today.",
    sections: [
      {
        id: "sdk-clients-checkout",
        title: "Checkout and webhook helpers",
        paragraphs: [
          "These are the most common SDK entry points for application code.",
        ],
        references: [
          {
            label: "Client",
            value: "createRenewCheckoutClient(config)",
            detail: "Low-level checkout client for browser or server use.",
          },
          {
            label: "Client",
            value: "createRenewServerClient(config)",
            detail: "Server wrapper around the checkout client.",
          },
          {
            label: "Helper",
            value: "verifyRenewWebhookSignature(input)",
            detail: "Validate webhook signatures.",
          },
          {
            label: "React",
            value: "RenewCheckoutModal | useRenewCheckoutSession",
            detail: "React checkout UI helpers.",
          },
        ],
      },
      {
        id: "sdk-clients-contracts",
        title: "Contract clients, events, and types",
        paragraphs: [
          "The core package also exports protocol and vault clients plus shared contract event helpers.",
        ],
        references: [
          {
            label: "Client",
            value: "createRenewProtocolClient(transport, address)",
            detail: "Protocol contract client.",
          },
          {
            label: "Client",
            value: "createRenewVaultClient(transport, address)",
            detail: "Vault contract client.",
          },
          {
            label: "Helper",
            value: "renewEventNames | isRenewEventName(value)",
            detail: "Event helper exports.",
          },
          {
            label: "Type",
            value: "RenewProtocolConfig | RenewCheckoutSession | RenewCheckoutPlan",
            detail: "Shared types for runtime config and checkout records.",
          },
        ],
        sample: {
          label: "Bootstrap contract clients from /v1/protocol",
          language: "ts",
          filename: "renew-contracts.ts",
          code: `import {
  createRenewProtocolClient,
  createRenewVaultClient,
  type ContractTransport,
  type RenewProtocolConfig,
} from "@renew.sh/sdk";

async function getRuntimeConfig(apiOrigin: string): Promise<RenewProtocolConfig> {
  const response = await fetch(\`\${apiOrigin}/v1/protocol\`);
  const payload = await response.json();
  return payload.data.config;
}

const config = await getRuntimeConfig("https://sandbox.renew.sh");

const protocol = createRenewProtocolClient(transport, config.protocolAddress);
const vault = createRenewVaultClient(transport, config.vaultAddress);`,
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
