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

## Settlement

Connect the Stellar wallet that should receive settlement in Dashboard > Settings > Settlement. Use the server SDK only when you already have the Stellar address and want to manage settlement accounts from your backend.

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

The settlement wallet must be funded on Stellar and trust Circle USDC before it can receive settlement.

## Settlement Path

Renew collects local payments, receives canonical USDC, routes settlement to Stellar USDC through Circle CCTP, then releases funds from the Renew settlement vault after the payout window.

## Server Usage

Create a collection for each order on your server.

```ts
import { renew } from "@renew.sh/sdk";

const client = renew({
  secretKey: process.env.RENEW_SECRET_KEY!,
});

const collection = await client.collections.create({
  amount: 2000,
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

    checkout.open(collection.checkoutUrl);
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
- Sandbox mode uses test keys, test checkout, sandbox local collection rails, Circle Iris sandbox, and the Stellar testnet vault. Live mode should only be used with production credentials and endpoints.
