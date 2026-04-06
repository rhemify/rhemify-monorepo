# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
bun run dev              # Start all apps (Turborepo)
bun run dev:web          # Start web app only (port 3001)
bun run build            # Build all apps
bun run check-types      # TypeScript type checking across all packages
bun run check            # Oxlint + Oxfmt formatting
```

### Database (SQLite/Turso via Drizzle ORM)

```bash
bun run db:local         # Start local SQLite dev server
bun run db:push          # Push schema changes to database
bun run db:generate      # Generate migration files from schema
bun run db:migrate       # Run migrations
bun run db:studio        # Open Drizzle Studio UI
```

### Adding shadcn/ui Components

```bash
cd apps/web && bunx shadcn@latest add <component>
```

### Convex (Database + Real-time Backend)

```bash
bunx convex dev              # Start Convex dev server (watches convex/ dir)
bunx convex deploy           # Deploy to production
```

Schema defined in `convex/schema.ts`. Query/mutation functions in `convex/*.ts`. Frontend reads from Convex directly (real-time sync). No SQL migrations — Convex handles schema changes automatically.

### Go Intelligence Server (apps/server)

```bash
cd apps/server

# Run the server
go run ./cmd/server

# Build binary
go build -o bin/server ./cmd/server

# Hot reload dev (requires: go install github.com/air-verse/air@latest)
make dev

# Resolve dependencies
go mod tidy
```

**Environment**: Copy `.env.example` → `.env`. Requires `CONVEX_URL` (deployment URL), `CONVEX_DEPLOY_KEY` (for server-to-server auth), `PORT` (default 8080), `CORS_ORIGIN` (default http://localhost:3001).

**Role**: Intelligence processing engine — reads from Convex via HTTP API, runs rules engine (anomaly detection, vendor health, route optimization), writes intelligence actions back. Not a CRUD API for the frontend.

## Architecture

Turborepo monorepo with Bun workspaces. Single fullstack app (`apps/web`) with shared packages.

### Dependency Graph

```
apps/web → packages/auth → packages/db → packages/env → packages/config
         → packages/ui  → packages/config
         → packages/env
```

### apps/web — TanStack Start (SSR React)

File-based routing via TanStack Router. Three visual domains in one app, separated by pathless route groups:

- **`_marketing/`** — Public landing page at `/`. Light warm palette (#F5F4F0) via `.theme-marketing` CSS scope.
- **`_onboarding/`** — Founder flow at `/signup`, `/build`, `/fund`, `/deploy`. Light neutral palette (#f7f7f5) via `.theme-onboarding` scope.
- **`/dashboard/*`** — Operational dashboard. Dark theme via Shadcn's `.dark` selector.

Theme switching is driven by layout wrappers, not a global toggle. Each layout sets its own theme.

**Data layer**: `MockFleetService` (in-memory) → TanStack Query hooks → UI components. The `FleetService` interface is designed to be swapped for real API calls later. `SimulationEngine` generates fake transactions client-side and invalidates query cache, same path a real websocket would use.

**Auth**: Better-Auth with email/password via `packages/auth`. Login at `/login`, API routes at `/api/auth/*`. The onboarding flow currently uses mock auth (MockFleetService session), not wired to Better-Auth yet.

### packages/db — Drizzle ORM + SQLite

Schema in `src/schema/auth.ts`: user, session, account, verification tables. Config in `drizzle.config.ts`.

### packages/ui — Shared Component Library

Shadcn/ui components + Rhemify brand tokens. `globals.css` defines the full theme system (light/dark CSS variables, brand colors). Apps import via `@rhemify-monorepo/ui/components/*`.

Brand tokens: `--color-rhm-accent` (#C8F03A), `--color-rhm-success`, `--color-rhm-warning`, `--color-rhm-danger`.

### packages/env — Environment Validation

Zod-validated env vars via `@t3-oss/env-core`. Server vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`. Client vars use `VITE_` prefix.

## Product Context — Rhemos

Rhemos is the verifiable payment layer for agentic commerce. **Route. Govern. Verify.**

> Here's proof of what happened, WHY it happened, what alternatives were rejected, and what would have happened if you changed the policy — plus we routed the payment in the first place.

### Core Architecture: The Routing Engine

```
Agent calls rhemos.pay(url)
  → Standard Detector (x402 / MPP / L402 / AP2 / ACP)
  → Policy Engine (limits, domains, standards, intelligence rules)
  → Path Resolver (AgentCard / OWS / Squads session / Jupiter swap / CCTP bridge)
  → Executor (sign + broadcast on Solana)
  → Decision Trace (full reasoning, hash anchored on Solana PDA)
  → Intelligence Layer (vendor scores, anomaly detection, replay)
```

### Reference Docs (in `docs/`)

**For development — read these:**

| Doc | What | Who Needs It |
|---|---|---|
| `docs/hackathon-positioning.md` | Product positioning, one-liner, pitch framing, demo narrative, judge talking points. **Source of truth for what we're building and why.** | Everyone |
| `docs/intelligence-layer-spec.md` | Full spec for intelligence layer: event ingestion, rules engine (12 rules across 5 categories), auto-actions, decision replay, configuration, data retention. **Build bible for the backend.** | Backend (Zhe Hong) |
| `docs/intelligence-layer-diagram.md` | Mermaid diagrams: full system flow, rules engine detail, action lifecycle, single payment sequence. | Everyone |
| `docs/competitive-analysis.md` | Deep analysis of MCPay, Latinum, CORBITS, Mercantill, Sponge, AgentCash, Observer Protocol. Micropayment criticism response. Ecosystem validation quotes. | Everyone (for pitch context) |
| `docs/vendor-instrument-analysis.md` | Every external service that integrates with Rhemos: signing (OWS, Privy, Squads), payment instruments (AgentCard, AgentCash, Squads sessions), swaps (Jupiter), bridges (CCTP), RPC (Helius), identity. | Sean, Wei Hup |

**Deprecated — do not use as source of truth:**

| Doc | Why |
|---|---|
| `docs/team-workstreams.md` | Outdated team size (was 3, now 4). Old "treasury" framing. **Use Linear board (linear.app/rhemify) for task assignments.** |

### Task Management

All tasks are in Linear: https://linear.app/rhemify (team: Rhemify, issues RHE-5 through RHE-50).

**Team:**
- **Sean** — Payment runtime: MCP server, standard detector, policy engine, OWS signing, path resolver, direct-pay execution
- **Zhe Hong** — Intelligence layer: Go backend, PostgreSQL schema, event ingestion, API endpoints, rules engine, replay engine
- **Wei Hup (Aaron)** — External integrations: AgentCard, Jupiter swap, CCTP bridge, onboarding CLI, real 402 endpoints
- **Jun Shen** — Frontend: dashboard (TanStack Start), onboarding wizard, trace viewer, intelligence chat, payment graph, replay UI

### Key External Services & APIs

| Service | Purpose | Docs |
|---|---|---|
| **@modelcontextprotocol/sdk** | MCP server for agent runtimes | modelcontextprotocol.io/docs |
| **OWS** | Local-first signing (BIP-39, AES-256-GCM) | github.com/open-wallet-standard |
| **Privy** | Cloud signing (SOC 2, embedded wallets) | privy.io |
| **Squads Smart Accounts** | Session-based payments, on-chain policies | docs.squads.so |
| **AgentCard** | Virtual Visa for agents (MPP SPT) | agentcard.ai |
| **AgentCash** | Curated API marketplace (338 endpoints) | agentcash.dev |
| **Jupiter** | Solana swap aggregator | dev.jup.ag/docs/apis/swap-api |
| **CCTP (Circle)** | Cross-chain USDC bridge (20+ chains) | circle.com/cross-chain-transfer-protocol |
| **Helius** | Solana RPC, Sender, Webhooks, DAS | helius.dev |

### Payment Standard Detection

```
Priority order for detectStandard():
  1. X-MPP-Payment-Intent → MPP (Stripe/Tempo)
  2. X-Payment-Required / X-Payment → x402 (Coinbase)
  3. WWW-Authenticate: L402 → L402 (Lightning)
  4. X-AP2-Payment → AP2 (Autonomous Payments v2)
  5. X-ACP-Job → ACP (Virtuals Protocol)
  6. Unknown → 'unknown', confidence: 'low'
```

### Path Resolver Instrument Priority

```
1. AgentCard (Visa via MPP SPT) — fiat vendors
2. Squads Smart Account session — recurring on-chain vendors (batched settlement)
3. Direct on-chain (OWS/Privy sign) — one-off payments
4. Jupiter swap — agent holds wrong token on same chain
5. CCTP bridge — vendor on different chain
6. Bridge + swap combo — different chain + wrong token
7. FAIL — structured error to agent
```

## Key Conventions

- **Styling**: Tailwind CSS 4 with Shadcn theme variables. No inline `style={{}}` — use Tailwind classes.
- **Fonts**: Inter (body) + DM Mono (technical values: IDs, amounts, timestamps, payment standards).
- **Linting**: Oxlint (not ESLint). Formatting: Oxfmt (not Prettier).
- **Path aliases**: `@/*` → `./src/*` in apps/web. `@rhemify-monorepo/ui/*` → packages/ui.
- **Naming**: Brand is "Rhemify" (company) / "Rhemos" (product). Product terms: Fleet, Agent, Department, Policy, Deploy, Freeze, Kill switch, Trace, Replay.
- **Vite plugin order**: `tailwindcss()` → `tanstackStart()` → `viteReact()` — ordering matters.
- **Do NOT** enable `verbatimModuleSyntax` in tsconfig.

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
