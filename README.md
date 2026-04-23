# Rhemos

The verifiable payment layer for agentic commerce. **Route. Govern. Verify.**

```
rhemos.pay(url)
```

One call. Any standard. Cheapest path. Fully governed. Permanently verifiable.

## What is Rhemos?

Agents shouldn't need to know what payment standard a vendor uses, what chain they're on, or how to get the right token there. Rhemos is the **Jupiter for agent payments** — it abstracts away the fragmentation so builders just build.

- **Route** — Multi-standard payment routing (x402, MPP, L402, AP2, ACP). Detects the standard from HTTP 402 headers, resolves the cheapest instrument + chain path, and executes.
- **Govern** — Fleet policy engine with per-agent spend limits, domain allowlists, standard restrictions, approval thresholds, and intelligence rules.
- **Verify** — Every payment decision hashed on Solana (PDAs). Provable, immutable, replayable decision traces.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | TanStack Start (React 19), TanStack Router, TanStack Query |
| UI | Tailwind CSS 4, shadcn/ui, Inter + DM Mono |
| Backend | Go (REST API + WebSocket) |
| Database | PostgreSQL (intelligence layer), SQLite/Turso (auth) |
| Payment Runtime | TypeScript, @x402/fetch, mppx, OWS signing |
| Settlement | Solana (trace hashes in PDAs), Helius RPC |
| Auth | Better-Auth (email/password) |
| Build | Turborepo, Bun |

## Project Structure

```
rhemify-monorepo/
├── apps/
│   └── web/              # Fullstack app (marketing + onboarding + dashboard)
├── packages/
│   ├── ui/               # Shared shadcn/ui components + brand tokens
│   ├── auth/             # Better-Auth configuration
│   ├── db/               # Drizzle ORM + SQLite schema
│   ├── env/              # Zod-validated environment variables
│   └── config/           # Shared TSConfig
├── docs/                 # Research, specs, architecture docs
└── turbo.json
```

## Getting Started

```bash
bun install
bun run dev:web          # Start web app on port 3001
```

### Database

```bash
bun run db:push          # Push schema changes
bun run db:studio        # Open Drizzle Studio
```

### All Commands

```bash
bun run dev              # Start all apps
bun run build            # Build all apps
bun run check-types      # TypeScript type checking
bun run check            # Oxlint + Oxfmt
```

## Payment Standards Supported

| Standard | Protocol | Header | SDK |
|----------|----------|--------|-----|
| x402 | HTTP 402 + `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` | Coinbase x402 v2 | @x402/fetch |
| MPP | HTTP 402 + `WWW-Authenticate: Payment` / `Authorization: Payment` | Tempo + Stripe | mppx |
| L402 | HTTP 402 + `WWW-Authenticate: L402 macaroon=..., invoice=...` | Lightning Labs | lsat-js |
| AP2 | Agent Payment Protocol v2 | Emerging | TBD |

## Team

- **Sean** — Core runtime (schemas, standard detection, policy engine, MCP server, SDK)
- **Aaron** — Payment execution (signing, AgentCard, Jupiter Swap, CCTP Bridge, 402 endpoints, CLI)
- **Zhe Hong** — Backend + intelligence (Go API, DB, event ingestion, rules engine, replay)
- **Jun Shen** — Dashboard + UI (fleet overview, trace viewer, intelligence chat, onboarding)

## License

Private — Colosseum Frontier hackathon submission (Apr 6 — May 11, 2026).
