# Renew

**Fiat-in, USDC-settled billing infrastructure.**

Renew lets businesses run recurring and usage-based billing in customers’ local fiat while settling in canonical USDC on Avalanche. It uses a hybrid architecture designed to keep customer payments simple and merchant settlement programmable: checkout, customer records, fiat collection, retries, FX logic, and provider webhooks run off-chain, while merchant registration, plans, subscriptions, charge execution, settlement credits, and merchant vault balances are anchored on-chain.

## Quick Links

- Website: [Renew App](https://www.renew.sh)
- Docs: [Renew Docs](https://www.renew.sh/docs)
- Sandbox Playground: [Renew Sandbox Playground](https://www.renew.sh/playground)
- Demo Video: [Renew.sh MVP Demo](https://youtu.be/1cq97cRhWww)
- SDK: [@renew.sh/sdk on npm](https://www.npmjs.com/package/@renew.sh/sdk)
- Sandbox API: [sandbox.renew.sh](https://sandbox.renew.sh)
- Live API: [api.renew.sh](https://api.renew.sh)
- Contract Addresses (Fuji): [RenewProtocol](https://testnet.snowtrace.io/address/0x7D6fF5964D1dd7E1cc4614Ed25292142f24e0b9E) and [RenewVault](https://testnet.snowtrace.io/address/0xD118f9Acd6654Ff11543c39264Aa8Fd73923f58A)

---

## How It Works

```
Customer subscribes and pays in local currency
        ↓
Payment rail collects fiat and Renew reconciles the charge
        ↓
Settlement value is normalized into USDC
        ↓
Circle CCTP bridges canonical USDC into Avalanche
        ↓
RenewProtocol executes the charge or credits settlement and updates RenewVault
        ↓
Merchant treasury Safe approves sweep and withdrawal to the payout wallet
```

**Key flow:**

1. Merchant boots a treasury Safe and registers on the protocol.
2. Merchant creates a billing plan from the dashboard and activates it through Safe-controlled treasury approval.
3. Merchant completes a one-time subscription operator authorization so Renew can create subscriptions on-chain without multisig approval on every checkout.
4. A checkout session is opened via the SDK or API.
5. The customer enters their details through the embeddable checkout modal and pays through normal fiat rails.
6. Renew creates the subscription on-chain, manages the billing schedule, and issues the charge when due.
7. The payment rail settles the collection, and Circle CCTP bridges canonical USDC into Avalanche.
8. RenewProtocol records the charge or settlement result and credits the merchant's vault balance.
9. The merchant withdraws through a Safe-controlled treasury sweep to the configured payout wallet.

---

## Project Structure

```
renew.sh/
├── client/             # Next.js 16 dashboard and marketing site
├── server/             # Express API, billing engine, and worker jobs
├── contracts/          # Solidity contracts (Avalanche C-Chain)
│   ├── script/
│   │   └── DeployRenewProtocol.s.sol # Foundry deployment script
│   └── src/
│       ├── RenewProtocol.sol         # Core protocol (plans, subscriptions, charges)
│       └── RenewVault.sol            # USDC custody and merchant balance accounting
├── packages/
│   └── renew-sdk/      # Published SDK (@renew.sh/sdk)
└── scripts/            # Operational helpers (Fuji deploy + smoke test wrappers)
```

### Client — `client/`

The merchant dashboard and public marketing site built with **Next.js 16**, **React 19**, **Tailwind CSS 4**, and **Framer Motion**.

| Surface | Description |
|---------|-------------|
| Overview | Customers, plans, subscriptions, market mix, upcoming renewals |
| Plans | Create, update, and activate billing plans with on-chain sync state |
| Customers | View customer billing state and payment history |
| Treasury | Safe custody, settlement sweeps, vault visibility, payout controls |
| Playground | Live checkout flow testing with sandbox payments |
| Settings | Team management, API keys, webhook endpoints |
| Docs | Inline SDK and API reference |

### Server — `server/`

The billing engine built with **Express**, **MongoDB**, **BullMQ**, and **TypeScript**.

| Module | Responsibility |
|--------|---------------|
| `auth` | Merchant authentication and session management |
| `plans` | Plan CRUD synced to the on-chain protocol |
| `subscriptions` | Subscription lifecycle and billing schedule |
| `charges` | Charge creation, retry logic, on-chain execution, and settlement tracking |
| `checkout` | Hosted checkout sessions with client secret auth |
| `customers` | Customer records and billing state |
| `payment-rails` | Yellow Card integration, webhooks, FX quotes |
| `settlements` | Settlement batching and CCTP bridge orchestration |
| `treasury` | Safe account management, protocol sync, treasury approvals, and sweep execution |
| `developers` | API key management and webhook delivery |
| `protocol` | On-chain contract interaction and state reads |
| `teams` | Multi-member workspace access control |
| `kyc` | KYC verification flow |
| `dashboard` | Aggregated overview metrics |

### Contracts — `contracts/`

Solidity smart contracts deployed on **Avalanche C-Chain**.

- **`RenewProtocol.sol`** — Core protocol managing merchants, plans, subscriptions, charges, settlement crediting, payout wallet controls, and vault withdrawals. Secured by charge operator and merchant-authorized subscription operator roles.
- **`RenewVault.sol`** — USDC custody contract that holds merchant balances and protocol fees. Only the protocol contract can credit balances and release funds.

### SDK — `packages/renew-sdk/`

Published as [`@renew.sh/sdk`](https://www.npmjs.com/package/@renew.sh/sdk). Provides:

- `@renew.sh/sdk` — Checkout client, contract clients, types
- `@renew.sh/sdk/server` — Server-side checkout helpers, webhook verification
- `@renew.sh/sdk/react` — Embeddable checkout modal and session hook

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Framer Motion |
| Backend | Node.js, Express, MongoDB, Mongoose, BullMQ, Zod |
| Blockchain | Avalanche C-Chain, Solidity ^0.8.24 |
| Payments | Yellow Card (fiat collection + FX), Circle CCTP (cross-chain USDC) |
| Treasury | Safe (multisig treasury approvals, governance, and withdrawals) |
| SDK | TypeScript, published to npm |

---

## On-Chain vs Off-Chain

**Off-chain**

- Checkout sessions and client-secret auth
- Customer PII and payment account details
- Fiat collection, FX quotes, retries, and provider webhooks
- Job orchestration, notifications, and operational state

**On-chain**

- Merchant registration
- Plan creation and activation state
- Subscription creation and lifecycle state
- Recurring charge execution and settlement crediting
- Merchant vault balances and protocol fee accounting

---

## Current Testnet Deployment

Avalanche Fuji deployment, updated on **March 10, 2026**:

- `RenewProtocol`: `0x7D6fF5964D1dd7E1cc4614Ed25292142f24e0b9E`
- `RenewVault`: `0xD118f9Acd6654Ff11543c39264Aa8Fd73923f58A`

---

## Getting Started

### Prerequisites

- Node.js ≥ 20.9.0
- MongoDB instance (local or Atlas)
- Redis instance (for BullMQ workers)

### Client

```bash
cd client
npm install
cp .env.example .env.local   # configure API origin, auth, etc.
npm run dev                   # http://localhost:3000
```

### Server

```bash
cd server
npm install
cp .env.example .env          # configure MongoDB, Redis, Yellow Card, Safe, etc.
npm run dev                   # http://localhost:4000
```

### Contracts

```bash
cd contracts
forge test --offline
```

Deploy to Avalanche Fuji with the Foundry script:

```bash
DEPLOYER_PRIVATE_KEY=<decimal_private_key> \
SETTLEMENT_ASSET_ADDRESS=<fuji_usdc_address> \
DEPLOYER_ADDRESS=<deployer_eoa> \
CHARGE_OPERATOR_ADDRESS=<executor_eoa> \
FEE_COLLECTOR_ADDRESS=<fee_collector_eoa> \
forge script script/DeployRenewProtocol.s.sol:DeployRenewProtocolScript \
  --rpc-url <fuji_rpc_url> \
  --broadcast
```

After deployment, update `server/.env`:

- `RENEW_PROTOCOL_ADDRESS_TEST`
- `RENEW_VAULT_ADDRESS_TEST`

### SDK (local development)

```bash
cd packages/renew-sdk
npm install
npm run build                 # outputs to dist/
npm test                      # runs 8 unit tests
```

The client references the SDK via `"@renew.sh/sdk": "file:../packages/renew-sdk"` during development.

### MVP Smoke Test

The core smoke flow lives in [server/src/scripts/e2e-mvp.ts](/Users/chigozzdev/Desktop/renew.sh/server/src/scripts/e2e-mvp.ts). The root wrapper script is [scripts/e2e-smoke.sh](/Users/chigozzdev/Desktop/renew.sh/scripts/e2e-smoke.sh). It expects:

- a running server
- MongoDB and Redis
- deployed Fuji protocol and vault addresses
- funded Fuji gas for the executor/deployer wallet
- funded Sepolia gas and Circle test USDC for the CCTP source wallet

Run it from the repo root with:

```bash
./scripts/e2e-smoke.sh
```

To provision or refresh the Fuji contract addresses used by the smoke test, use [scripts/deploy-fuji.sh](/Users/chigozzdev/Desktop/renew.sh/scripts/deploy-fuji.sh):

```bash
./scripts/deploy-fuji.sh
```

---

## Environment Variables

The server requires the following key environment variables (see `server/.env.example` for the full list):

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_URL` | Redis URL for BullMQ job queues |
| `PAYMENT_ENV` / `AVALANCHE_ENV` | Active runtime mode (`test` or `live`) |
| `YELLOW_CARD_API_KEY_TEST` / `YELLOW_CARD_API_KEY_LIVE` | Yellow Card API credentials |
| `SAFE_EXECUTOR_PRIVATE_KEY_TEST` / `SAFE_EXECUTOR_PRIVATE_KEY_LIVE` | Executor key for Safe and protocol operations |
| `DEPLOYER_PRIVATE_KEY_TEST` / `DEPLOYER_PRIVATE_KEY_LIVE` | Contract deployment key |
| `RENEW_PROTOCOL_ADDRESS_TEST` / `RENEW_PROTOCOL_ADDRESS_LIVE` | Deployed RenewProtocol address |
| `RENEW_VAULT_ADDRESS_TEST` / `RENEW_VAULT_ADDRESS_LIVE` | Deployed RenewVault address |
| `CCTP_SOURCE_RPC_URL_*` / `CCTP_SOURCE_PRIVATE_KEY_*` | Circle CCTP source chain connectivity |
| `CCTP_SOURCE_USDC_ADDRESS_*` | Source-chain USDC token address |
| `CCTP_TOKEN_MESSENGER_ADDRESS_*` | Circle Token Messenger contract |
| `CCTP_MESSAGE_TRANSMITTER_ADDRESS_*` | Circle Message Transmitter contract |
| `CCTP_ATTESTATION_API_URL_*` | Circle attestation API endpoint |

---

## Current Payment Markets

Renew is market-extensible. The current sandbox catalog includes local-currency collection across:

> BWP · CDF · GHS · KES · MWK · NGN · RWF · TZS · UGX · XAF · XOF · ZAR · ZMW

These are implementation-time payment rail markets, not a hard product boundary. Settlement and billing are designed to remain chain-native and portable as additional markets and providers are added.
