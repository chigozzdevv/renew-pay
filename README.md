# Renew

**Fiat-in billing infrastructure with USDC settlement on Solana.**

Renew lets merchants charge customers in local fiat, reconcile billing off-chain, and settle completed payments in USDC on Solana. It is built to solve the friction, low success rates, and poor reliability of card-based billing across many African markets by letting customers pay with the methods and currencies they already use and trust.

Renew uses Partna and Yellow Card for local collection, Privy for authentication and wallet management, Sumsub for KYC and KYB, and Squads for treasury control.

## Runtime Status

Renew currently runs in test mode on Solana devnet with Partna and Yellow Card test rails and Sumsub test KYC during onboarding.

Live mode is not active yet. It will follow the Solana mainnet deployment and the production compliance rollout. The live stack will include KYC, KYB, AML, KYT, and Travel Rule controls for real-money activity, through our existing Sumsub integration.

Current compliance config:

- Test KYC: `SUMSUB_LEVEL_NAME_KYC_TEST`
- Live KYC: `SUMSUB_LEVEL_NAME_KYC_LIVE`
- Live KYB: `SUMSUB_LEVEL_NAME_KYB_LIVE`

- Live AML / KYT / Travel Rule: added with the Sumsub production compliance stack

## Quick Links

- App: [app.renew.sh](https://app.renew.sh)
- Docs: [app.renew.sh/docs](https://app.renew.sh/docs)
- Playground: [app.renew.sh/playground](https://app.renew.sh/playground)
- Sandbox API: [staging-pay.renew.sh](https://staging-pay.renew.sh)
- Live API: [pay.renew.sh](https://pay.renew.sh)
- SDK: [@renew.sh/sdk on npm](https://www.npmjs.com/package/@renew.sh/sdk)

## Platform

| Surface | Value |
|---------|-------|
| Auth | Privy |
| Onboarding | Owner, business, market, payout wallet, verification |
| Payment rail | Partna (default) + Yellow Card (sandbox checkout / invoice) |
| Local billing markets | `NGN`, `GHS`, `KES` |
| Settlement asset | `USDC` |
| Settlement network | Solana |
| Treasury / approvals | Squads multisig |
| Verification | Sumsub |
| Protocol program | Anchor program: `renew_protocol` |

Server defaults come from [server/.env.example](./server/.env.example):

- `PAYMENT_RAIL_PROVIDER_TEST=partna`
- `PAYMENT_RAIL_PROVIDER_LIVE=partna`
- `SOLANA_CLUSTER_TEST=devnet`
- `SOLANA_CLUSTER_LIVE=mainnet-beta`

## How Renew Works

1. The merchant signs in with Privy.
2. Onboarding completes the actual workspace setup: owner details, business details, supported billing markets, payout wallet, and verification.
3. The merchant creates a subscription plan or invoice from the dashboard or API.
4. Renew creates a checkout or invoice payment flow and provisions the customer’s local collection instructions through the active payment rail.
5. The customer pays in local fiat.
6. Renew reconciles the payment rail event, normalizes the value into USDC, and records settlement state.
7. The protocol records the billing and settlement state on Solana.
8. Treasury actions and payout controls are managed through Squads-backed governance and approved payout wallets.

## Architecture

### Off-chain

- Privy authentication and session exchange
- Onboarding state and merchant workspace management
- Hosted checkout, customer records, invoices, and subscriptions
- Partna and Yellow Card payment-rail orchestration, webhooks, and FX quotes
- Notification delivery, job queues, and dashboard aggregation
- Sumsub KYC / KYB orchestration

### On-chain

- Merchant protocol identity
- Plan lifecycle and subscription lifecycle
- Charge and settlement recording
- Merchant settlement balances
- Treasury-controlled payout execution on Solana

## Project Structure

```text
renew-pay/
├── client/                # Next.js app: marketing site, auth, onboarding, dashboard
├── server/                # Express API, billing engine, workers, webhooks
├── contracts/             # Anchor / Rust Solana program: renew_protocol
│   ├── programs/
│   │   └── renew_protocol/
│   ├── target/
│   └── Anchor.toml
├── packages/
│   └── renew-sdk/         # Published SDK (@renew.sh/sdk)
```

### Client

The client is a Next.js 16 app used for:

- marketing pages
- Privy sign-in
- onboarding
- dashboard surfaces for customers, plans, subscriptions, invoices, treasury, developers, and settings
- playground checkout testing

### Server

The server is an Express + TypeScript API used for:

- auth and workspace session management
- onboarding and verification orchestration
- customers, plans, subscriptions, charges, and invoices
- Partna and Yellow Card payment-rail integration and webhooks
- Solana protocol execution and settlement tracking
- Squads treasury coordination
- developer keys and webhook delivery

### Contracts

The `contracts/` workspace contains the `renew_protocol` Solana program.

- Program: `renew_protocol`
- Devnet program address: `fScJ66UUXwsb4ogdFgYSZfEG7piyhTi4z9gZZe931oh`
- Language: Rust
- Framework: Anchor
- Test config: Solana devnet

### SDK

[`@renew.sh/sdk`](https://www.npmjs.com/package/@renew.sh/sdk) provides:

- checkout session clients
- server-side checkout helpers
- webhook verification helpers
- React checkout components

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Framer Motion |
| Backend | Node.js, Express, MongoDB, Mongoose, BullMQ, Zod |
| Auth | Privy |
| Verification | Sumsub |
| Payments | Partna + Yellow Card |
| Protocol | Solana, Anchor, SPL Token |
| Treasury | Squads multisig |
| SDK | TypeScript, npm |

## Payment Rails And Markets

Renew defaults to Partna for the main test runtime and also supports Yellow Card for sandbox checkout and invoice payment flows.

Supported local billing markets:

- `NGN`
- `GHS`
- `KES`

These are the current local billing markets exposed in the active test catalog.

## Getting Started

### Prerequisites

- Node.js `20.x`
- MongoDB
- Redis
- Rust toolchain if you are working on the Solana program
- Solana CLI and Anchor if you are building or deploying the program

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

### Solana Program

```bash
cd contracts
cargo test --workspace
anchor build
```

The default local Anchor config is in [contracts/Anchor.toml](./contracts/Anchor.toml).

### SDK

```bash
cd packages/renew-sdk
npm install
npm run build
npm test
```

## Environment Highlights

The full list lives in [server/.env.example](./server/.env.example). The most important groups are:

### Core app

- `APP_BASE_URL`
- `API_BASE_URL`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `REDIS_URL`
- `PAYMENT_ENV`

### Payment rail selection

- `PAYMENT_RAIL_PROVIDER_TEST`
- `PAYMENT_RAIL_PROVIDER_LIVE`

### Solana / protocol

- `SOLANA_CLUSTER_TEST`
- `SOLANA_CLUSTER_LIVE`
- `SOLANA_RPC_URL_TEST`
- `SOLANA_RPC_URL_LIVE`
- `SOLANA_WS_URL_TEST`
- `SOLANA_WS_URL_LIVE`
- `RENEW_PROGRAM_ID_TEST`
- `RENEW_PROGRAM_ID_LIVE`
- `RENEW_SETTLEMENT_MINT_TEST`
- `RENEW_SETTLEMENT_MINT_LIVE`
- `SOLANA_ADMIN_SECRET_KEY_TEST`
- `SOLANA_ADMIN_SECRET_KEY_LIVE`
- `SOLANA_SETTLEMENT_AUTHORITY_SECRET_KEY_TEST`
- `SOLANA_SETTLEMENT_AUTHORITY_SECRET_KEY_LIVE`

### Partna

- `PARTNA_V4_BASE_URL_TEST`
- `PARTNA_V4_BASE_URL_LIVE`
- `PARTNA_VOUCHERS_BASE_URL_TEST`
- `PARTNA_VOUCHERS_BASE_URL_LIVE`
- `PARTNA_API_KEY_TEST`
- `PARTNA_API_KEY_LIVE`
- `PARTNA_API_USER_TEST`
- `PARTNA_API_USER_LIVE`
- `PARTNA_WEBHOOK_PUBLIC_KEY_TEST`
- `PARTNA_WEBHOOK_PUBLIC_KEY_LIVE`

### Yellow Card

- `YELLOW_CARD_BASE_URL_TEST`
- `YELLOW_CARD_BASE_URL_LIVE`
- `YELLOW_CARD_API_KEY_TEST`
- `YELLOW_CARD_API_KEY_LIVE`
- `YELLOW_CARD_WEBHOOK_SECRET_TEST`
- `YELLOW_CARD_WEBHOOK_SECRET_LIVE`

### Auth and verification

- `PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `SUMSUB_BASE_URL_TEST`
- `SUMSUB_APP_TOKEN_TEST`
- `SUMSUB_SECRET_KEY_TEST`
- `SUMSUB_LEVEL_NAME_KYC_TEST`
- `SUMSUB_LEVEL_NAME_KYB_TEST`
- `SUMSUB_WEBHOOK_SECRET_TEST`
- `SUMSUB_BASE_URL_LIVE`
- `SUMSUB_APP_TOKEN_LIVE`
- `SUMSUB_SECRET_KEY_LIVE`
- `SUMSUB_LEVEL_NAME_KYC_LIVE`
- `SUMSUB_LEVEL_NAME_KYB_LIVE`
- `SUMSUB_WEBHOOK_SECRET_LIVE`

Live AML / KYT / Travel Rule configuration should be added alongside this compliance block in `server/.env.example` once the production providers are selected.

### Platform auth

- `PLATFORM_AUTH_ENABLED`
- `PLATFORM_AUTH_JWT_SECRET`

*`renew_protocol` has not yet undergone an external security audit. Treat this repository and its deployed program configuration as a test-environment system, not a production-ready deployment.*
