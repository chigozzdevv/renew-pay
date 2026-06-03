# `@renew.sh/sdk`

Renew SDK for:

- collection creation
- Stellar settlement accounts
- checkout links
- browser checkout
- webhook signing and verification helpers

## Install

```bash
npm install @renew.sh/sdk
```

## Test and live

The server SDK infers test or live from the server key:

- `rw_test_*` for sandbox
- `rw_live_*` for live

Use `environment` or `apiOrigin` only for advanced overrides. The API host and key must still match.

## One-Time Settlement Setup

Connect the Stellar wallet that should receive settlement.

```ts
import { renew } from "@renew.sh/sdk";

const client = renew({
  secretKey: process.env.RENEW_SECRET_KEY!,
});

await client.settlement.accounts.create({
  accountCode: "main-wallet",
  name: "Main wallet",
  destinationAddress: process.env.SETTLEMENT_WALLET!,
  isDefault: true,
});
```

## Server Usage

Create a collection for each order on your server.

```ts
import { renew } from "@renew.sh/sdk";

const client = renew({
  secretKey: process.env.RENEW_SECRET_KEY!,
});

const collection = await client.collections.create({
  amount: 25000,
  currency: "NGN",
  reference: "order_1042",
  description: "Order #1042",
});

console.log(collection.id, collection.checkoutUrl);
```

## Browser Usage

```tsx
"use client";

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
}
```

## React Usage

```tsx
"use client";

import { RenewCheckout } from "@renew.sh/sdk/react";

export function RenewPayButton({ checkoutUrl }: { checkoutUrl: string }) {
  return <RenewCheckout checkoutUrl={checkoutUrl}>Pay</RenewCheckout>;
}
```

## Webhook Verification

```ts
import {
  renewWebhookHeaderNames,
  verifyRenewWebhookSignature,
} from "@renew.sh/sdk/server";

const isValid = verifyRenewWebhookSignature({
  payload: rawBody,
  signingSecret: process.env.RENEW_WEBHOOK_SECRET!,
  signatureHeader: request.headers.get(renewWebhookHeaderNames.signature),
  timestampHeader: request.headers.get(renewWebhookHeaderNames.timestamp),
});
```

## Package Surfaces

- `@renew.sh/sdk`
  - core exports
  - `renew(...)`
  - `checkout.open(...)`
  - collection client
  - settlement account client
- `@renew.sh/sdk/server`
  - server integration helpers
  - webhook signing and verification
- `@renew.sh/sdk/react`
  - React checkout helpers

## Notes

- Use server keys only on trusted backend infrastructure.
- Use checkout URLs in browser flows.
- Sandbox mode is for demo and test integrations. Live mode should only be used with production credentials and endpoints.
