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

## Current State (as of 2026-04-01)

**Everything is mock/frontend-only.** No real payment runtime, no backend API, no persistent DB beyond auth tables. The dashboard runs on `MockFleetService` + `SimulationEngine` generating fake transactions client-side.

### What exists
- Full onboarding flow UI (signup → build → fund → deploy)
- Dashboard shell with fleet overview, live feed, policy editor, agent detail
- Payment standard types (`PaymentStandard`: x402, mpp, l402, ap2) and UI chips
- `FleetService` interface ready to swap mock → real API
- Better-Auth wired for email/password login
- Drizzle schema for auth tables only (user, session, account, verification)

### What doesn't exist yet
- Real payment protocol handlers (no actual 402 detection or payment execution)
- Backend API (Go, per Linear tickets)
- Payment event / decision trace persistence
- MCP Server
- Real 402 endpoint integrations
- Wallet/signing infrastructure
