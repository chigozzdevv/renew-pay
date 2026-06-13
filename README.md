# Renew

**Local fiat collection with stable settlement.**

Renew helps merchants collect local payments and receive Stellar USDC settlement. Merchants create a collection, open Renew Checkout, and Renew handles local collection, reconciliation, fees, settlement tracking, and Stellar release.

Renew uses Partna for local collection, Privy for authentication, Sumsub for verification, Stellar Wallets Kit for wallet connection, Circle CCTP for USDC routing, and a Stellar settlement vault for released USDC settlement.

## Runtime Status

Renew runs in test mode with Partna test collection, Sumsub sandbox verification, and Stellar testnet settlement configuration.

Live mode follows mainnet settlement configuration and production compliance controls.

## Quick Links

- App: [www.renew.sh](https://www.renew.sh)
- Playground: [www.renew.sh/playground](https://www.renew.sh/playground)
- Docs: [www.renew.sh/docs](https://www.renew.sh/docs)
- Sandbox API: [sandbox.renew.sh](https://sandbox.renew.sh)
- Live API: [api.renew.sh](https://api.renew.sh)
- SDK: [@renew.sh/sdk on npm](https://www.npmjs.com/package/@renew.sh/sdk)

## Callback URLs

- Partna sandbox: `https://sandbox.renew.sh/v1/onramps/webhooks/partna`
- Partna live: `https://api.renew.sh/v1/onramps/webhooks/partna`
- Sumsub verification: `https://api.renew.sh/v1/kyc/webhooks/sumsub`

## Platform

| Surface | Value |
|---------|-------|
| Auth | Privy |
| Onboarding | Owner, business, settlement wallet, verification |
| Collection | Partna |
| Local markets | `GHS`, `KES`, `NGN` |
| Settlement | Stellar USDC |
| Verification | Sumsub |

## How Renew Works

1. The merchant signs in with Privy.
2. The merchant completes workspace setup, verification, and settlement wallet connection.
3. The merchant creates a collection from the dashboard, API, SDK, or playground.
4. Renew returns a hosted checkout URL.
5. The customer pays through Renew Checkout.
6. Renew reconciles the collection, fees, and settlement amount.
7. Renew routes USDC settlement to the Stellar vault.
8. The Stellar vault releases USDC to the merchant wallet after the release window.

## Architecture

Off-chain handles product logic, customer data, collection orchestration, settlement state, notifications, webhooks, and dashboard aggregation.

On-chain activity is limited to Stellar USDC vault settlement and release transactions.

### Server

- Auth and workspace sessions
- Onboarding and verification
- Collections, customers, settlement accounts, settlement records, and history
- Partna collection, quotes, and webhooks
- Stellar settlement vault release execution
- Developer keys and webhook delivery

### Client

- Marketing site
- Privy sign-in
- Onboarding
- Dashboard: overview, collections, customers, settlement, history, and settings
- Playground checkout
- Hosted public checkout page at `/pay/{payId}`

### SDK

[`@renew.sh/sdk`](https://www.npmjs.com/package/@renew.sh/sdk) provides collection creation, checkout, settlement account helpers, and webhook verification.

```ts
import { checkout, renew } from "@renew.sh/sdk";

const client = renew({
  secretKey: process.env.RENEW_SECRET_KEY!,
});

const collection = await client.collections.create({
  amount: 2000,
  currency: "NGN",
  reference: "order_1042",
  description: "Order #1042",
});

checkout.open(collection.checkoutUrl);
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
| Verification | Sumsub |
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
