# Fundz Escrow — Backend

# Fundz Escrow

> Trustless, permissionless escrow infrastructure on the Stellar Network.
> Built with Soroban smart contracts, a Node.js indexing backend, and a
> Next.js frontend with Freighter wallet integration.

[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](LICENSE)
[![Network: Stellar](https://img.shields.io/badge/Network-Stellar-blue.svg)](https://stellar.org)
[![Built with: Soroban](https://img.shields.io/badge/Built%20with-Soroban-7B2FBE.svg)](https://soroban.stellar.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## Table of Contents

- [What This Is](#what-this-is)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Frontend](#frontend)
- [Backend](#backend)
- [Smart Contract](#smart-contract)
- [Shared Packages](#shared-packages)
- [Environment Variables](#environment-variables)
- [Escrow State Machine](#escrow-state-machine)
- [API Reference](#api-reference)
- [Contract Functions](#contract-functions)
- [User Flows](#user-flows)
- [Live Deployment](#live-deployment)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

---

## What This Is

Fundz Escrow is open-source infrastructure that lets any application
integrate trustless escrow functionality into their user flows. It supports
multi-token escrow (XLM, USDC, any Stellar asset), optional arbitration,
deadline-based expiry, and on-chain dispute resolution — all enforced by
a Soroban smart contract.

The system is built on three independent layers:

- **Smart Contract** — the on-chain judge. Holds funds, enforces state
  transitions, validates signatures, and resolves disputes. Nothing moves
  without the contract's authorization.
- **Backend** — the clerk. Builds unsigned transactions, indexes contract
  events into a PostgreSQL database, and exposes a clean REST API.
- **Frontend** — the interface. Connects Freighter wallet, signs
  transactions locally, and renders real-time escrow state.

The contract is the sole source of truth. If the backend goes down,
funds remain safe and users can interact with the contract directly
through any Stellar explorer or CLI tool.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND  ·  apps/frontend/                                 │
│  Next.js 14 · Tailwind CSS · Freighter Wallet · Zustand      │
│                                                              │
│  Buyer Flow       Seller Flow       Arbitrator Flow          │
│  Create escrow    View escrows      View disputes            │
│  Fund escrow      Track status      Resolve cases            │
│  Confirm/Dispute  Receive funds     Sign resolutions         │
└───────────────┬──────────────────────────────┬──────────────┘
                │  REST API calls               │  Signed XDR
                ▼                              ▼
┌──────────────────────────────────────────────────────────────┐
│  BACKEND  ·  apps/backend/                                   │
│  Node.js 20 · Express · TypeScript · Prisma · PostgreSQL     │
│                                                              │
│  API Layer          Stellar Service     Event Indexer        │
│  Build unsigned tx  Submit to Horizon   Poll contract events │
│  Serve escrow data  Fee simulation      Write DB records     │
│  Auth middleware    Account loading     Ledger tracking      │
└───────────────┬──────────────────────────────┬──────────────┘
                │  Submit transactions          │  Listen events
                ▼                              ▼
┌──────────────────────────────────────────────────────────────┐
│  SMART CONTRACT  ·  contracts/escrow/                        │
│  Rust · Soroban SDK · Stellar Network                        │
│                                                              │
│  create_escrow()     fund_escrow()       confirm_delivery()  │
│  raise_dispute()     resolve_dispute()   refund_expired()    │
│  get_escrow()                                                │
└──────────────────────────────────────────────────────────────┘
```

**Core design rule:** If it affects money or trust, it belongs in the
contract. The backend coordinates; the contract decides.

---

## Project Structure

```
fundz-escrow/
│
├── apps/
│   ├── frontend/                  # Next.js application
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx           # Dashboard
│   │   │   │   ├── create/
│   │   │   │   │   └── page.tsx       # Create escrow wizard
│   │   │   │   └── escrow/
│   │   │   │       └── [id]/
│   │   │   │           └── page.tsx   # Escrow detail + actions
│   │   │   ├── components/
│   │   │   │   ├── escrow/
│   │   │   │   │   ├── EscrowCard.tsx
│   │   │   │   │   ├── EscrowTimeline.tsx
│   │   │   │   │   └── EscrowStateBadge.tsx
│   │   │   │   ├── forms/
│   │   │   │   │   ├── CreateEscrowForm.tsx
│   │   │   │   │   └── ResolveDisputeForm.tsx
│   │   │   │   └── shared/
│   │   │   │       ├── WalletConnect.tsx
│   │   │   │       ├── TransactionModal.tsx
│   │   │   │       └── AddressTag.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useWallet.ts
│   │   │   │   ├── useEscrow.ts
│   │   │   │   ├── useEscrowList.ts
│   │   │   │   └── useTransaction.ts
│   │   │   ├── services/
│   │   │   │   └── api.ts
│   │   │   ├── wallet/
│   │   │   │   └── freighter.ts
│   │   │   └── store/
│   │   │       └── walletStore.ts
│   │   ├── package.json
│   │   ├── tailwind.config.ts
│   │   └── next.config.js
│   │
│   └── backend/                   # Express API + indexer
│       ├── src/
│       │   ├── app.ts
│       │   ├── config/
│       │   │   └── env.ts
│       │   ├── routes/
│       │   │   └── escrow.routes.ts
│       │   ├── controllers/
│       │   │   └── escrow.controller.ts
│       │   ├── services/
│       │   │   ├── escrow.service.ts
│       │   │   └── stellar.service.ts
│       │   ├── indexer/
│       │   │   └── event.listener.ts
│       │   ├── middleware/
│       │   │   ├── auth.ts
│       │   │   └── error.ts
│       │   └── db/
│       │       └── client.ts
│       ├── prisma/
│       │   └── schema.prisma
│       ├── package.json
│       └── tsconfig.json
│
├── contracts/
│   └── escrow/                    # Soroban smart contract
│       ├── src/
│       │   ├── lib.rs
│       │   ├── contract.rs
│       │   ├── storage.rs
│       │   ├── types.rs
│       │   ├── events.rs
│       │   └── errors.rs
│       ├── tests/
│       │   └── escrow_test.rs
│       ├── Cargo.toml
│       └── Makefile
│
├── packages/
│   ├── sdk/                       # Shared transaction builders
│   │   └── src/
│   │       ├── contract.ts
│   │       ├── transactions.ts
│   │       └── utils.ts
│   └── types/                     # Shared TypeScript interfaces
│       └── src/
│           └── index.ts
│
├── scripts/                       # Deployment + automation
├── .env.example
├── docker-compose.yml
├── turbo.json
└── package.json
```

---

## Prerequisites

Before you begin, make sure you have the following installed:

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Frontend + backend runtime |
| Rust | stable | Smart contract compilation |
| Soroban CLI | latest | Contract deploy + invoke |
| Docker | any | PostgreSQL via docker-compose |
| Freighter | browser ext | Stellar wallet for signing |

Install the Rust `wasm32` target:

```bash
rustup target add wasm32-unknown-unknown
```

Install the Soroban CLI:

```bash
cargo install --locked soroban-cli
```

Install Freighter:
[https://freighter.app](https://freighter.app) — switch it to **Testnet**
before running the app locally.

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_ORG/fundz-escrow.git
cd fundz-escrow
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Open .env and fill in your values
```

### 4. Start the database

```bash
docker-compose up -d
```

### 5. Run database migrations

```bash
cd apps/backend
npx prisma migrate dev
```

### 6. Start all services

```bash
# From the project root
npm run dev
```

This starts:
- Frontend → [http://localhost:3001](http://localhost:3001)
- Backend  → [http://localhost:3000](http://localhost:3000)

---

## Frontend

### Stack

| Library | Purpose |
|---------|---------|
| Next.js 14 (App Router) | Framework |
| TypeScript strict mode | Language |
| Tailwind CSS | Styling |
| Zustand | Global wallet state |
| React Hook Form + Zod | Form handling + validation |
| @stellar/freighter-api | Wallet integration |

### Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — all escrows for connected wallet |
| `/create` | 4-step wizard to create a new escrow |
| `/escrow/[id]` | Escrow detail, event timeline, and action panel |

### Transaction flow

The frontend never constructs or holds raw private keys. Every
state-mutating action follows this exact pattern:

```
1. User clicks action button (e.g. "Fund Escrow")
2. Frontend posts to backend endpoint → receives unsigned XDR
3. Frontend passes XDR to Freighter → user approves in wallet popup
4. Frontend sends signed XDR to POST /escrow/submit
5. Backend submits signed XDR to Stellar Network via Horizon
6. Event indexer detects emitted contract event → updates DB
7. Frontend re-fetches escrow state → UI re-renders
```

### Running frontend only

```bash
cd apps/frontend
npm run dev
```

### Building for production

```bash
cd apps/frontend
npm run build
npm start
```

---

## Backend

### Stack

| Library | Purpose |
|---------|---------|
| Express.js | HTTP framework |
| TypeScript | Language |
| Prisma | Database ORM |
| PostgreSQL | Primary database |
| @stellar/stellar-sdk | Horizon + SorobanRpc client |
| Zod | Environment + request validation |

### What the backend does

The backend has exactly three responsibilities:

**1. Transaction building** — Load the caller's Stellar account, construct
the Soroban contract invocation operation, simulate for fee estimation,
and return the unsigned XDR string to the frontend.

**2. Transaction submission** — Accept a signed XDR from the frontend
and submit it to Stellar via the Horizon API.

**3. Event indexing** — Poll the Soroban RPC server every 5 seconds for
contract events, parse state transition events, and upsert the
corresponding escrow records in PostgreSQL.

### What the backend does NOT do

- Decide who receives funds — that is the contract's job
- Store authoritative escrow state — the DB is a read-optimized cache
- Hold or use user private keys — users sign locally with Freighter
- Override or bypass contract authorization checks

### Running backend only

```bash
cd apps/backend
npm run dev
```

### Database commands

```bash
# Apply migrations
npx prisma migrate dev

# Open Prisma Studio (database GUI)
npx prisma studio

# Reset and re-seed
npx prisma migrate reset
```

---

## Smart Contract

### Stack

| Tool | Purpose |
|------|---------|
| Rust (stable) | Language |
| soroban-sdk v21 | Contract framework |
| wasm32-unknown-unknown | Compilation target |
| soroban-sdk testutils | Integration test harness |

### Contract files

| File | Purpose |
|------|---------|
| `src/lib.rs` | Contract declaration and public exports |
| `src/contract.rs` | All `#[contractimpl]` functions |
| `src/types.rs` | `Escrow` struct and `EscrowState` enum |
| `src/storage.rs` | Persistent storage read/write helpers |
| `src/events.rs` | Structured event emission helpers |
| `src/errors.rs` | `ContractError` enum with error codes |
| `tests/escrow_test.rs` | Full integration test suite (17 tests) |

### Build commands

```bash
cd contracts/escrow

# Compile to WASM
make build

# Optimize WASM binary size
make optimize

# Run all tests
make test
```

### Deploying to testnet

```bash
# Generate a deployer identity (first time only)
soroban keys generate deployer --network testnet

# Fund the deployer on testnet
soroban keys fund deployer --network testnet

# Deploy contract
make deploy-testnet
# Outputs: CONTRACT_ID=CXXXXXXXXXX... → save this to your .env
```

### Invoking on testnet

```bash
# Create an escrow
make invoke-create \
  BUYER=G... \
  SELLER=G... \
  TOKEN=G... \
  AMOUNT=10000000 \
  DEADLINE=1735689600

# Query escrow state
soroban contract invoke \
  --id $CONTRACT_ID \
  --network testnet \
  --source deployer \
  -- get_escrow \
  --escrow_id 1
```

---

## Shared Packages

### packages/types

Shared TypeScript interfaces used by both frontend and backend. Mirrors
the Soroban contract types exactly, giving the whole stack a single
source of truth for data shapes.

```typescript
export type EscrowState =
  | 'INIT'
  | 'FUNDED'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'REFUNDED'
  | 'EXPIRED'

export interface Escrow {
  escrowId:     string
  buyer:        string
  seller:       string
  arbitrator:   string | null
  amount:       string        // i128 stroops as string
  tokenAddress: string
  state:        EscrowState
  deadline:     string        // ISO 8601
  createdAt:    string
  events?:      EscrowEvent[]
}

export interface EscrowEvent {
  escrowId:  string
  eventType: string
  ledger:    number
  txHash:    string
  payload:   Record<string, unknown>
  createdAt: string
}
```

### packages/sdk

Reusable transaction-building utilities. Any Stellar application can
install this package and add escrow functionality without depending on
the backend.

```bash
npm install @fundz-escrow/sdk
```

```typescript
import { buildCreateEscrowTx } from '@fundz-escrow/sdk'

const xdr = await buildCreateEscrowTx({
  buyer:        'G...',
  seller:       'G...',
  amount:       10_000_000n,   // in stroops
  tokenAddress: 'G...',
  deadline:     1735689600,
  network:      'testnet',
})
```

---

## Environment Variables

```bash
# ─── Database ────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fundz_escrow

# ─── Stellar Network ─────────────────────────────────────────
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# ─── Contract ────────────────────────────────────────────────
CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# ─── Backend Server ──────────────────────────────────────────
PORT=3000
CORS_ORIGIN=http://localhost:3001
JWT_SECRET=replace-with-a-strong-random-secret

# ─── Frontend (public — safe to expose) ──────────────────────
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
```

For mainnet, change `STELLAR_NETWORK=mainnet` and update the RPC and
Horizon URLs. The mainnet passphrase is:
`Public Global Stellar Network ; September 2015`

---

## Escrow State Machine

Only the smart contract can advance state. The backend and frontend
observe and display state — they never write it directly.

```
                       ┌─────────┐
                       │  INIT   │  ← create_escrow()
                       └────┬────┘
                            │ fund_escrow()
                            ▼
                       ┌─────────┐
             ┌─────────│ FUNDED  │─────────┐
             │         └────┬────┘         │
             │              │              │
   raise_    │   confirm_   │   deadline   │ raise_
   dispute() │   delivery() │   passed     │ dispute()
             │              │              │
             ▼              ▼              ▼
        ┌──────────┐  ┌───────────┐  ┌──────────┐
        │ DISPUTED │  │ COMPLETED │  │ DISPUTED │
        └────┬─────┘  └───────────┘  └────┬─────┘
             │  resolve_dispute()          │
             ├────────────┬───────────────┘
             ▼            ▼
       ┌──────────┐  ┌──────────┐
       │COMPLETED │  │ REFUNDED │
       └──────────┘  └──────────┘

  refund_expired() applies when state=FUNDED and deadline has passed
  → sets state to EXPIRED and returns funds to buyer
```

---

## API Reference

Endpoints that return `{ xdr }` return an **unsigned transaction**.
The frontend must sign it with Freighter and post the result to
`POST /escrow/submit`.

### Build transaction endpoints

**Create escrow**
```
POST /escrow/create
x-wallet-address: G...  (buyer)

Body:
{
  "seller":       "G...",
  "arbitrator":   "G...",       // optional
  "amount":       "10000000",   // in stroops
  "tokenAddress": "G...",
  "deadline":     "2025-12-31T00:00:00Z"
}

Response: { "xdr": "AAAAAgAAAAA..." }
```

**Fund escrow**
```
POST /escrow/fund
x-wallet-address: G...  (buyer)
Body: { "escrowId": "1" }
Response: { "xdr": "..." }
```

**Confirm delivery**
```
POST /escrow/confirm-delivery
x-wallet-address: G...  (buyer)
Body: { "escrowId": "1" }
Response: { "xdr": "..." }
```

**Raise dispute**
```
POST /escrow/raise-dispute
x-wallet-address: G...  (buyer or seller)
Body: { "escrowId": "1" }
Response: { "xdr": "..." }
```

**Resolve dispute**
```
POST /escrow/resolve-dispute
x-wallet-address: G...  (arbitrator)
Body: { "escrowId": "1", "releaseToSeller": true }
Response: { "xdr": "..." }
```

### Submit endpoint

```
POST /escrow/submit
Body: { "signedXdr": "AAAAAgAAAAA..." }
Response: { "txHash": "abc123...", "successful": true }
```

### Query endpoints

```
GET /escrow/:id
Response: Escrow object with full events array

GET /escrow/buyer/:address
GET /escrow/seller/:address
Response: Escrow[] ordered by createdAt descending

GET /escrow/health
Response: { "status": "ok", "network": "testnet", "contractId": "C...", "ledger": 12345678 }
```

---

## Contract Functions

| Function | Required Auth | State Required | Result |
|----------|--------------|---------------|--------|
| `create_escrow` | buyer | — | Creates escrow, returns `escrow_id`, state=INIT |
| `fund_escrow` | buyer | INIT | Transfers tokens to contract, state=FUNDED |
| `confirm_delivery` | buyer | FUNDED | Transfers tokens to seller, state=COMPLETED |
| `raise_dispute` | buyer or seller | FUNDED | state=DISPUTED |
| `resolve_dispute` | arbitrator | DISPUTED | Pays seller or refunds buyer |
| `refund_expired` | anyone | FUNDED + past deadline | Refunds buyer, state=EXPIRED |
| `get_escrow` | none | any | Returns `Escrow` struct (read-only) |

All state-mutating functions call `require_auth()` internally. Unauthorized
calls are rejected by the contract with `ContractError::Unauthorized`
before any state or funds are touched.

---

## User Flows

### Buyer

1. Connect Freighter wallet (switch to Testnet in Freighter settings)
2. Navigate to `/create` and fill in the 4-step wizard:
   - Seller address and optional arbitrator address
   - Token (XLM / USDC / custom) and amount
   - Deadline date and time
   - Review and confirm
3. Sign the `create_escrow` transaction in Freighter
4. On the escrow page, click **Fund Escrow** → sign → escrow is now active
5. After the seller delivers: click **Confirm Delivery** → funds are released
6. If there is a problem: click **Raise Dispute** → arbitrator reviews

### Seller

1. Connect Freighter wallet
2. Dashboard shows escrows where your address is the seller
3. Once buyer funds the escrow, status changes to **Funded** — safe to begin work
4. Deliver work off-chain (the contract does not track off-chain activity)
5. When the buyer confirms delivery, funds arrive in your wallet automatically

### Arbitrator

1. Connect Freighter wallet — your address must match the arbitrator set on the escrow
2. Dashboard filters to **Disputed** escrows assigned to your address
3. Review the escrow details and event timeline
4. Select **Release funds to seller** or **Refund buyer**
5. Sign the `resolve_dispute` transaction → ruling is executed on-chain immediately

---

## Live Deployment

| Network | Contract ID | Explorer link |
|---------|-------------|---------------|
| Testnet | `Coming soon` | [stellar.expert/testnet](https://stellar.expert/explorer/testnet) |
| Mainnet | Not yet deployed | — |

---

## Contributing

Contributions are welcome across all three layers — frontend, backend,
and smart contract. This project participates in the **Stellar Wave Program**
on Drips, where resolved issues earn contributor points each monthly Wave cycle.

### Getting started

```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/fundz-escrow.git

# 3. Create a feature branch
git checkout -b feat/your-feature-name

# 4. Make your changes and commit
git commit -m "feat: describe what you built"

# 5. Push and open a pull request
git push origin feat/your-feature-name
```

### Issue complexity labels

| Label | Wave Points | Good for |
|-------|-------------|---------|
| `complexity: trivial` | 100 pts | Docs, typos, config, minor fixes |
| `complexity: medium` | 150 pts | New component, test coverage, small feature |
| `complexity: high` | 200 pts | New contract function, indexer, major feature |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide: local setup,
branch conventions, commit format, and PR checklist.

---

## Roadmap

- [ ] Deploy Soroban contract to Stellar Testnet
- [ ] Complete frontend buyer / seller / arbitrator dashboards
- [ ] PostgreSQL event indexer — full end-to-end pipeline
- [ ] Publish `@fundz-escrow/sdk` to npm
- [ ] Multi-token support (XLM, USDC, custom Stellar assets)
- [ ] Milestone-based partial fund releases
- [ ] Email / webhook notifications on state transitions
- [ ] Reputation scoring for buyers and sellers
- [ ] Mainnet deployment
- [ ] Security audit

---

## License

[MIT](LICENSE) — free to use, fork, build on, and ship.

---

<div align="center">

Built on [Stellar](https://stellar.org) &nbsp;·&nbsp;
Powered by [Soroban](https://soroban.stellar.org) &nbsp;·&nbsp;
Part of the [Stellar Wave Program](https://drips.network)

</div>
## Related Repos

- [fundz-escrow-frontend](https://github.com/soft-plug/fundz-escrow-frontend)
- [fundz-escrow-contract](https://github.com/soft-plug/fundz-escrow-contract)
