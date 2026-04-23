# CLAUDE.md

**Rhemos** — the verifiable payment layer for agentic commerce. Route. Govern. Verify.

`rhemos.pay(url)` — one call, any standard (x402/MPP/L402/AP2), any chain, cheapest path, fully governed, permanently verifiable on Solana.

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

## Key Conventions

- **Styling**: Tailwind CSS 4 with Shadcn theme variables. No inline `style={{}}` — use Tailwind classes.
- **Fonts**: Inter (body) + DM Mono (technical values: IDs, amounts, timestamps, payment standards).
- **Linting**: Oxlint (not ESLint). Formatting: Oxfmt (not Prettier).
- **Path aliases**: `@/*` → `./src/*` in apps/web. `@rhemify-monorepo/ui/*` → packages/ui.
- **Naming**: Brand is "Rhemify". Product terms: Fleet, Agent, Department, Policy, Deploy, Freeze, Kill switch.
- **Vite plugin order**: `tailwindcss()` → `tanstackStart()` → `viteReact()` — ordering matters.
- **Do NOT** enable `verbatimModuleSyntax` in tsconfig.

### Go Intelligence Server (apps/server)

```bash
cd apps/server
make dev           # Hot reload (requires air)
make test          # Run all tests (82 total)
make seed          # Seed demo data (requires server running)
```

**API Docs:** Start the server and open http://localhost:8080/docs (Swagger UI).
OpenAPI spec at `apps/server/docs/openapi.yaml`.

**Role:** Intelligence processing engine — reads from Convex via HTTP API, runs rules engine (anomaly detection, vendor health, route optimization), writes intelligence actions back. Not a CRUD API for the frontend.

**Key packages:**
- `internal/engine/` — 7 intelligence rules (VH-1, VH-2, SA-1, SA-2, SA-3, RO-1, SUB-1)
- `internal/replay/` — Decision replay engine with counterfactual analysis
- `internal/handler/` — HTTP handlers (ingest, replay, events, fleet, vendor, policy, anchor)
- `internal/anchor/` — Solana Merkle tree trace anchoring
- `cmd/seed/` — Demo data seeder (5 scenarios)

**Environment:** Copy `.env.example` → `.env`. Requires `CONVEX_URL`, `CONVEX_DEPLOY_KEY`, `PORT` (default 8080), `CORS_ORIGIN`.

**Frontend integration:** The Go server writes to Convex tables that the frontend reads via `useQuery()`. See `packages/backend/convex/intelligence.ts`, `aggregates.ts`, and `vendors.ts` for the ready-to-use frontend query functions (marked with `@junshen` comments).
