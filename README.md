# Renew

**Local fiat collection with stable settlement.**

Renew helps merchants collect local payments and settle in stable assets. Merchants create a collection, open Renew checkout, and Renew handles local collection, reconciliation, fees, payout tracking, and settlement.

Renew uses Partna for local collection, Privy for authentication, Sumsub for KYC/KYB, direct Solana settlement for standard payouts, and Umbra for private USDC settlement routes.

## Runtime Status

Renew runs in test mode on Solana devnet with Partna test collection and Sumsub test verification during onboarding.

Live mode follows mainnet settlement configuration and production compliance controls.

## Quick Links

- App: [app.renew.sh](https://app.renew.sh)
- Docs: [app.renew.sh/docs](https://app.renew.sh/docs)
- Sandbox API: [staging-pay.renew.sh](https://staging-pay.renew.sh)
- Live API: [pay.renew.sh](https://pay.renew.sh)
- SDK: [@renew.sh/sdk on npm](https://www.npmjs.com/package/@renew.sh/sdk)

## Platform

| Surface | Value |
|---------|-------|
| Auth | Privy |
| Onboarding | Owner, business, markets, payout wallet, verification |
| Collection | Partna |
| Local markets | `GHS`, `KES`, `NGN` |
| Standard settlement | Direct Solana SPL transfer |
| Private settlement | Umbra USDC |
| Verification | Sumsub |

## How Renew Works

1. The merchant signs in with Privy.
2. The merchant completes workspace setup and verification.
3. The merchant creates a collection from the dashboard or API.
4. Renew returns a hosted checkout URL.
5. The customer pays through Renew checkout.
6. Renew reconciles the collection, fees, and stable amount.
7. Renew queues a payout against the collection’s settlement route.
8. Settlement executes through direct Solana or Umbra private settlement.

## Architecture

Off-chain handles product logic, customer data, collection orchestration, payout state, notifications, webhooks, and dashboard aggregation.

On-chain activity is limited to stable settlement transactions and privacy-provider transactions where the selected route uses Umbra.

### Server

- Auth and workspace sessions
- Onboarding and verification
- Collections, customers, settlement routes, payouts, and history
- Partna collection, quotes, and webhooks
- Direct Solana and Umbra payout execution
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
├── contracts/             # Solana commitment program workspace
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
| Settlement | Solana, SPL Token, Umbra |
| SDK | TypeScript, npm |

## Getting Started

### Prerequisites

- Node.js `20.x`
- MongoDB
- Redis
- Rust, Solana CLI, and Anchor if working in `contracts/`

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
