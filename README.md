# Fundz Escrow — Backend

Express + TypeScript API server for the Fundz decentralized escrow application. Builds Soroban transactions, indexes contract events, and serves escrow data to the frontend.

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Express + TypeScript
- **ORM:** Prisma (PostgreSQL)
- **Stellar SDK:** @stellar/stellar-sdk (SorobanRpc)
- **Validation:** Zod

## Getting Started

```bash
npm install
cp .env.example .env        # fill in your values
npx prisma migrate dev      # run DB migrations
npm run dev                 # starts on :3000
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `STELLAR_NETWORK` | `testnet` or `mainnet` |
| `SOROBAN_RPC_URL` | Soroban RPC endpoint |
| `HORIZON_URL` | Horizon REST API endpoint |
| `NETWORK_PASSPHRASE` | Stellar network passphrase |
| `CONTRACT_ID` | Deployed escrow contract address |
| `PORT` | HTTP server port (default: 3000) |
| `CORS_ORIGIN` | Allowed CORS origin (default: http://localhost:3001) |

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/escrow/create` | wallet header | Build create_escrow XDR |
| `POST` | `/escrow/fund` | wallet header | Build fund_escrow XDR |
| `POST` | `/escrow/confirm-delivery` | wallet header | Build confirm_delivery XDR |
| `POST` | `/escrow/raise-dispute` | wallet header | Build raise_dispute XDR |
| `POST` | `/escrow/resolve-dispute` | wallet header | Build resolve_dispute XDR |
| `POST` | `/escrow/submit` | none | Submit signed XDR |
| `GET` | `/escrow/:id` | none | Get escrow by ID |
| `GET` | `/escrow/buyer/:address` | none | Get escrows by buyer |
| `GET` | `/escrow/seller/:address` | none | Get escrows by seller |
| `GET` | `/escrow/health` | none | Health check |

## Architecture

The backend never holds private keys. It builds unsigned XDR transactions, the frontend signs them with Freighter, then submits the signed XDR back via `/escrow/submit`.

An event listener polls the Soroban RPC every 5 seconds for contract events and keeps the PostgreSQL database in sync.

## Related Repos

- [fundz-escrow-frontend](https://github.com/soft-plug/fundz-escrow-frontend)
- [fundz-escrow-contract](https://github.com/soft-plug/fundz-escrow-contract)
