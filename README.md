# Renew

**Local fiat collection with stable settlement.**

Renew helps merchants collect local payments and settle in stable assets. Merchants create a collection, open Renew checkout, and Renew handles local collection, reconciliation, fees, payout tracking, and Stellar USDC settlement.

Renew uses Partna for local collection, Privy for authentication, Didit for KYC/KYB, and a Stellar settlement vault for released USDC payouts.

## Runtime Status

Renew runs in test mode with Partna test collection, Didit test verification, and Stellar testnet settlement configuration.

Live mode follows mainnet settlement configuration and production compliance controls.

## Quick Links

- App: [www.renew.sh](https://www.renew.sh)
- Docs: [www.renew.sh/docs](https://www.renew.sh/docs)
- Sandbox API: [sandbox.renew.sh](https://sandbox.renew.sh)
- Live API: [api.renew.sh](https://api.renew.sh)
- SDK: [@renew.sh/sdk on npm](https://www.npmjs.com/package/@renew.sh/sdk)

## Callback URLs

- Partna sandbox: `https://sandbox.renew.sh/v1/onramps/webhooks/partna`
- Partna live: `https://api.renew.sh/v1/onramps/webhooks/partna`
- Didit verification: `https://api.renew.sh/v1/kyc/webhooks/didit`

## Platform

| Surface | Value |
|---------|-------|
| Auth | Privy |
| Onboarding | Owner, business, markets, payout wallet, verification |
| Collection | Partna |
| Local markets | `GHS`, `KES`, `NGN` |
| Settlement | Stellar USDC |
| Verification | Didit |

## How Renew Works

1. The merchant signs in with Privy.
2. The merchant completes workspace setup and verification.
3. The merchant creates a collection from the dashboard or API.
4. Renew returns a hosted checkout URL.
5. The customer pays through Renew checkout.
6. Renew reconciles the collection, fees, and stable amount.
7. Renew queues settlement against the merchant’s settlement account.
8. The Stellar vault releases USDC to the merchant wallet after the release window.

## Architecture

Off-chain handles product logic, customer data, collection orchestration, payout state, notifications, webhooks, and dashboard aggregation.

On-chain activity is limited to Stellar USDC vault settlement and release transactions.

### Server

- Auth and workspace sessions
- Onboarding and verification
- Collections, customers, settlement accounts, payouts, and history
- Partna collection, quotes, and webhooks
- Stellar settlement vault payout execution
- Developer keys and webhook delivery

### Client

- Marketing site
- Privy sign-in
- Onboarding
- Dashboard: overview, collections, customers, settlement, payouts, history, settings
- Hosted public checkout page at `/pay/{payId}`

### SDK

[`@renew.sh/sdk`](https://www.npmjs.com/package/@renew.sh/sdk) provides collection creation, checkout, and webhook verification.

```ts
import { checkout, renew } from "@renew.sh/sdk";

const client = renew({
  secretKey: process.env.RENEW_SECRET_KEY!,
});

const collection = await client.collections.create({
  amount: 25000,
  currency: "NGN",
  reference: "order_1042",
  description: "Order #1042",
});

await checkout.open(collection.checkoutUrl);
```

## Project Structure

```text
renew-pay/
├── client/                # Next.js app
├── server/                # Express API, workers, webhooks
├── contracts/             # Stellar settlement vault contract workspace
└── packages/
    └── renew-sdk/         # Published SDK (@renew.sh/sdk)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Framer Motion |
| Backend | Node.js, Express, MongoDB, Mongoose, BullMQ, Zod |
| Auth | Privy |
| Verification | Didit |
| Collection | Partna |
| Settlement | Stellar, Soroban, USDC |
| SDK | TypeScript, npm |

## Getting Started

### Prerequisites

- Node.js `20.x`
- MongoDB
- Redis
- Rust and Stellar CLI if working in `contracts/`

### Client

```bash
cd client
npm install
cp .env.example .env.local
npm run dev
```

Default local URL: `http://localhost:3000`

### Server

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Default local URL: `http://localhost:4000`
