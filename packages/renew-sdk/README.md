# `@renew.sh/sdk`

Renew SDK for:

- headless checkout session creation and lifecycle
- server-side checkout helpers
- React checkout modal and session polling
- webhook signing and verification helpers
- protocol and vault contract clients

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
import { createRenewServerClient } from "@renew.sh/sdk/server";

const renew = createRenewServerClient({
  environment: "sandbox",
  secretKey: process.env.RENEW_SECRET_KEY!,
});

const plans = await renew.listCheckoutPlans();

const { session, clientSecret } = await renew.createCheckoutSession({
  planId: plans[0].id,
});
```

## React Checkout

```tsx
"use client";

import { useState } from "react";
import {
  RenewCheckoutModal,
  createRenewCheckoutClient,
} from "@renew.sh/sdk";

const client = createRenewCheckoutClient({
  environment: "sandbox",
});

export function CheckoutExample() {
  const [session, setSession] = useState(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <RenewCheckoutModal
      isOpen={isOpen}
      client={client}
      session={session}
      clientSecret={clientSecret}
      onClose={() => setIsOpen(false)}
      onSettled={(nextSession) => {
        console.log("Settled", nextSession.id);
      }}
    />
  );
}
```

The modal is self-contained. It does not require Tailwind or Renew app theme tokens.

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
  - checkout client
  - contract clients
- `@renew.sh/sdk/server`
  - server integration helpers
  - webhook signing and verification
- `@renew.sh/sdk/react`
  - React checkout modal
  - checkout session hook

## Notes

- Use server keys only on trusted backend infrastructure.
- Use checkout sessions and client secrets for browser flows.
- Sandbox mode is for demo and test integrations. Live mode should only be used with production credentials and endpoints.
