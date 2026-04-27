# Rhemify

The verifiable payment layer for agentic commerce. **Route. Govern. Verify.**

```
rhemos.pay(url)
```

One call. Any standard (x402, MPP, L402, AP2). Any chain. Cheapest path. Fleet-governed. Permanently verifiable on Solana.

## What is Rhemify?

Agents shouldn't need to know what payment standard a vendor uses, what chain they're on, or how to get the right token there. Rhemify is the treasury intelligence layer for agentic commerce — abstracting payment fragmentation so builders just build.

- **Route** — Detects the payment standard from HTTP 402 headers, resolves the cheapest instrument + chain path, and executes. Base is the default EVM chain for x402; Solana↔Base bridging via Circle CCTP.
- **Govern** — Fleet policy engine with per-agent spend limits, domain allowlists, standard restrictions, and approval thresholds. Policy is enforced client-side before any on-chain transaction.
- **Verify** — Every payment decision is hashed and anchored to Solana via PDAs (Anchor program). Not just what was paid — the full reasoning context: task state, alternatives evaluated, policy rules fired, confidence on standard detection.

## What Makes It Different

Every competitor solves one piece:

| Competitor | Gap |
|---|---|
| MCPay | x402 only, no governance |
| Latinum | Custodial wallet, no policy engine |
| Sponge (YC W26) | x402 routing, no intelligence layer |
| Mercantill | On-chain multi-sig governance, no standard detection or replay |

Rhemify combines multi-standard routing + fleet governance + decision intelligence + non-custodial architecture. The intelligence layer compounds: every payment builds vendor reliability scores, payment graph memory, and decision patterns.

## Base Integration

Base is the primary EVM execution chain in Rhemify's payment routing stack.

**Exclusive to Base:**
- Default EVM destination for x402 micropayments (lowest fees, deepest endpoint coverage)
- Exclusive Solana↔EVM bridge via Circle CCTP — other EVM chains (Avalanche, IoTeX) are reachable via relay.link but not CCTP
- Majority of the 338+ seeded x402 vendor endpoints are on Base

**Shared with other networks:**
- Policy enforcement applies to all chains before any transaction is broadcast
- relay.link routes to non-Base EVM chains as fallback paths

## Decision Trace Replay

The standout primitive. Given any `payment_trace_id`, Rhemify reconstructs the exact agent state at the moment of decision and re-runs it in a sandbox. Change one policy variable and see how the outcome changes.

> "Agent spent $340 at 2am" → "Agent spent $340 because it was executing step 3 of a market research task, x402 was detected with high confidence, AgentCard was rejected for insufficient balance, and the daily limit still had $660 remaining."

## Payment Standards Supported

| Standard | Protocol | Default Chain |
|---|---|---|
| x402 | HTTP 402 + `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` | Base (USDC) |
| MPP | HTTP 402 + `WWW-Authenticate: Payment` | Multi-chain |
| L402 | HTTP 402 + `WWW-Authenticate: L402 macaroon=..., invoice=...` | Lightning |
| AP2 | Agent Payment Protocol v2 | TBD |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TanStack Start (React 19), TanStack Router, TanStack Query |
| UI | Tailwind CSS 4, shadcn/ui, Inter + DM Mono |
| Backend | Go (REST API), Convex (realtime data) |
| Database | Convex (intelligence + fleet data), SQLite/Turso (auth) |
| Payment Runtime | TypeScript, @x402/fetch, mppx, OWS signing |
| Settlement | Solana (Anchor PDAs for trace hashing), Base (x402 + CCTP) |
| Auth | Better-Auth (email/password) |
| Build | Turborepo, Bun, Vite + Nitro (Vercel deployment) |

## Project Structure

```
rhemify-monorepo/
├── apps/
│   ├── web/              # Fullstack app (marketing + onboarding + dashboard)
│   └── server/           # Go intelligence server (rules engine, replay, anchoring)
├── packages/
│   ├── ui/               # Shared shadcn/ui components + brand tokens
│   ├── auth/             # Better-Auth configuration
│   ├── db/               # Drizzle ORM + SQLite schema
│   ├── env/              # Zod-validated environment variables
│   └── config/           # Shared TSConfig
├── docs/                 # Research, specs, application drafts
└── turbo.json
```

## Getting Started

```bash
bun install
bun run dev:web          # Start web app on port 3001
```

### All Commands

```bash
bun run dev              # Start all apps
bun run build            # Build all apps
bun run check-types      # TypeScript type checking
bun run check            # Oxlint + Oxfmt
```

### Go Intelligence Server

```bash
cd apps/server
make dev                 # Hot reload (requires air)
make test                # Run all tests
make seed                # Seed demo data
```

## Team

- **Sean** — Core runtime (schemas, standard detection, policy engine, MCP server, SDK)
- **Aaron** — Payment execution (signing, AgentCard, Jupiter Swap, CCTP Bridge, 402 endpoints, CLI)
- **Zhe Hong** — Backend + intelligence (Go API, DB, event ingestion, rules engine, replay)
- **Jun Shen** — Dashboard + UI (fleet overview, trace viewer, intelligence chat, onboarding)

## License

Private — Colosseum Frontier hackathon submission (Apr 6 — May 11, 2026).
