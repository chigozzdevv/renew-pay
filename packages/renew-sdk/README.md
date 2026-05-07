# `@renew.sh/sdk`

Renew SDK for:

- collection creation
- checkout links
- browser checkout
- webhook signing and verification helpers

## Install

```bash
npm install @renew.sh/sdk
```

## Environments

Renew SDK supports two runtime environments:

- `sandbox`
- `live`

You can configure the client with either:

- `environment`
- `apiOrigin`

Server keys must use:

- `rw_test_*` for sandbox
- `rw_live_*` for live

## Server Usage

```ts
import { renew } from "@renew.sh/sdk";

const client = renew({
  environment: "sandbox",
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

```ts
"use client";

import { checkout } from "@renew.sh/sdk";

checkout.open(collection.checkoutUrl);
```

## React Usage

```tsx
"use client";

import { RenewCheckout } from "@renew.sh/sdk/react";

export function PayButton({ checkoutUrl }: { checkoutUrl: string }) {
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
- `@renew.sh/sdk/server`
  - server integration helpers
  - webhook signing and verification
- `@renew.sh/sdk/react`
  - React checkout helpers

## Notes

- Use server keys only on trusted backend infrastructure.
- Use checkout URLs in browser flows.
- Sandbox mode is for demo and test integrations. Live mode should only be used with production credentials and endpoints.
