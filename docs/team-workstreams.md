# Rhemos — Team Workstreams

## Colosseum Frontier (April 6 - May 11, 2026)

Three vertical slices. Each person owns a demoable slice of the product they can ship independently. Minimal cross-team blocking.

| Workstream | Owner | Scope |
|---|---|---|
| **1. Payment Runtime** | Sean | MCP server, standard detector, policy engine, SDK, onboarding CLI |
| **2. Intelligence Layer** | Fullstack Dev | Decision traces, event logging, replay engine, Go backend API, vendor intelligence |
| **3. Dashboard + Design** | Designer | Fleet dashboard, trace viewer, policy editor, brand system, landing page, slides |

---

## Timeline Overview

```
PRE-HACKATHON (Mar 30 → Apr 5) — 1 week
  Priority: Schema contracts, MCP server scaffold, design tokens, wireframes
  Goal:     Team aligned on interfaces so hackathon starts at full speed

HACKATHON WEEK 1 (Apr 6-12) — Foundation
  Sean:     Standard detector, policy engine core, payment event emission
  Fullstack: Database schema, event ingestion pipeline, vendor registry seed
  Designer: Dashboard layout + routing, fleet overview, agent table, live feed (mock data)

HACKATHON WEEK 2 (Apr 13-19) — Core Engine
  Sean:     Path resolver, OWS signing, direct-pay (Solana + Base), AgentCard integration
  Fullstack: All API endpoints (fleet stats, agents, events, traces, policy CRUD)
  Designer: Decision trace viewer, policy editor, connect to mock API

HACKATHON WEEK 3 (Apr 20-26) — Integration
  Sean:     MCP server → live backend, npx rhemos onboard, real 402 endpoints
  Fullstack: WebSocket live feed, decision replay engine, end-to-end data flow
  Designer: Switch mock → real API, WebSocket live feed, replay UI, agent detail page

HACKATHON WEEK 4 (Apr 27 - May 3) — Polish + Differentiation
  Sean:     Multi-standard demo flow, L402 support, cross-chain CCTP, kill switch, edge cases
  Fullstack: Replay with variable modification, vendor intelligence API, cost attribution, performance
  Designer: Vendor intel view, kill switch UI, landing page, responsive polish, loading states

HACKATHON WEEK 5 (May 4-11) — Demo + Submission
  Sean:     Demo script rehearsal, npx onboard on clean machine
  Fullstack: Seed demo data if needed, replay demo rehearsal
  Designer: Presentation slides, demo video, visual QA pass
  ALL:      Demo dry run (May 5), final rehearsal with timing (May 8), submit (May 10)
```

---

## Integration Contracts

These are agreed upon **before building**. Each contract has an owner who defines the spec and a consumer who depends on it.

### Contract 1: Payment Event Schema

**Owner:** Sean | **Consumer:** Fullstack Dev | **Deadline:** Apr 5 (before hackathon starts)

```typescript
interface PaymentEvent {
  id: string
  timestamp: string                // ISO 8601
  agent_id: string
  fleet_id: string
  standard: 'x402' | 'mpp' | 'l402' | 'ap2' | 'acp' | 'unknown'
  standard_version: string
  amount: number                   // USD equivalent
  token: string                    // e.g., 'USDC'
  chain_from: string               // e.g., 'solana'
  chain_to: string
  domain: string                   // target server domain
  outcome: 'success' | 'rejected' | 'failed'
  parent_event_id: string | null   // delegation chain
  delegation_depth: number
  instrument_type: 'ows' | 'privy' | 'agentcard' | 'raw'
  trace_id: string                 // links to PaymentTrace
}
```

### Contract 2: Decision Trace Format

**Owner:** Sean | **Consumer:** Fullstack Dev + Designer | **Deadline:** Apr 5 (before hackathon starts)

```typescript
interface PaymentTrace {
  id: string
  payment_event_id: string
  agent_task_description: string   // what the agent was trying to do
  agent_task_step: number
  trigger_402_raw: string          // full HTTP 402 response
  standard_detected: string
  standard_confidence: 'high' | 'medium' | 'low'
  alternatives_evaluated: Array<{
    path: string                   // e.g., 'agentcard_mpp_spt', 'ows_solana_usdc'
    rejected_reason: string        // e.g., 'insufficient_balance', 'policy_block'
  }>
  policy_rules_fired: Array<{
    rule: string                   // e.g., 'daily_limit'
    value: string                  // e.g., '$340 / $500'
    result: 'pass' | 'flag' | 'block'
    evaluated_at: string
  }>
  instrument_selection_log: string // why this instrument was chosen
  bridge_scoring: object | null    // cost/time comparison if bridge was considered
  economic_rationality_check: object | null
  task_outcome: 'success' | 'failure' | 'pending' | null
  task_outcome_linked_at: string | null
  replay_snapshot: object          // full state needed to replay this decision
}
```

### Contract 3: Backend API Endpoints

**Owner:** Fullstack Dev | **Consumer:** Designer | **Deadline:** Apr 12 (end of hackathon week 1)

```
GET    /api/fleet/stats              → { total_spend, active_agents, blocked_count, ... }
GET    /api/fleet/agents             → [{ agent_id, name, status, daily_spend, limit, ... }]
GET    /api/fleet/agents/:id         → { agent detail + recent events }
GET    /api/events                   → [PaymentEvent] (paginated, filterable)
GET    /api/events/:id               → PaymentEvent + linked PaymentTrace
GET    /api/traces/:id               → full PaymentTrace
POST   /api/traces/:id/replay        → { replayed_outcome, diff_from_original }
GET    /api/policy                   → current fleet policy
PUT    /api/policy                   → update fleet policy
GET    /api/policy/agents/:id        → per-agent policy overrides
PUT    /api/policy/agents/:id        → update per-agent policy
GET    /api/vendors                  → [{ domain, success_rate, avg_latency, standards, ... }]
WS     /api/events/stream            → real-time payment event feed
```

### Contract 4: Real-Time Feed Protocol

**Owner:** Fullstack Dev | **Consumer:** Designer | **Deadline:** Apr 19 (end of hackathon week 2)

WebSocket at `/api/events/stream`. Pushes `PaymentEvent` JSON on every new event. Designer's live feed component subscribes on dashboard mount.

### Contract 5: Design Tokens

**Owner:** Designer | **Consumer:** Sean + Fullstack Dev | **Deadline:** Apr 5 (before hackathon starts)

Extends existing Rhemify brand tokens. Defines Rhemos-specific palette, typography rules, component patterns. Published as CSS variables in `packages/ui/globals.css`. Everyone follows these for any UI surface including CLI output colors and formatting.

---

## Workstream 1: Payment Runtime (Sean)

### Scope

Everything in the core `pay(resource)` path — from the moment an agent calls `rhemos.pay(url)` to the payment executing and the event being emitted. You ship first to unblock the other two.

### Out of Scope

Dashboard UI, backend API server, database queries, replay logic. You emit events and traces — others consume them.

### Tech Stack

- TypeScript (SDK + MCP server)
- MCP SDK for tool registration
- OWS (@open-wallet-standard/core) for local signing
- Privy SDK for cloud signing
- AgentCard API for virtual Visa provisioning
- Solana web3.js, viem + ethers for chain interactions
- CCTP SDK (Circle) for bridging

### Week-by-Week

**Pre-Hackathon (Mar 30 - Apr 5): Contracts + Scaffold**

| Deliverable | Acceptance Criteria |
|---|---|
| Payment event schema defined | Schema doc reviewed by fullstack dev, typed interfaces exported from shared package |
| Decision trace format defined | Trace interface covers all fields from PRD section 7.3.1, reviewed by team |
| MCP server scaffold | `rhemos.pay`, `rhemos.status`, `rhemos.set_policy`, `rhemos.check_policy` registered as MCP tools. Server starts and responds to tool calls with stubs. |

**Hackathon Week 1 (Apr 6-12): Standard Detection + Policy**

| Deliverable | Acceptance Criteria |
|---|---|
| Standard Detector v1 | Given a mock HTTP 402 response, correctly identifies x402 (X-Payment-Required / X-Payment headers), MPP (X-MPP-Payment-Intent), and L402 (WWW-Authenticate: L402). Unit tests for each standard. |
| Policy engine | Evaluates `daily_limit`, `max_per_tx`, `approval_threshold`, `allowed_domains`, `allowed_standards`. Returns structured rejection `{ rejected, reason, rule, suggestion }`. Every evaluation emits a policy_decision event. |
| Payment event emission | Every `pay()` call emits a `PaymentEvent` + `PaymentTrace` to stdout/event bus. Format matches Contract 1 and 2. |

**Hackathon Week 2 (Apr 13-19): Execution Layer**

| Deliverable | Acceptance Criteria |
|---|---|
| MPP Normalizer | Converts detected standard into internal PaymentIntent format. Handles x402 and MPP at minimum. |
| Path Resolver | Given a PaymentIntent + wallet manifest, scores available instruments and returns ranked payment paths. Handles AgentCard (if MPP SPT accepted) and direct on-chain (OWS/Privy). |
| OWS signing adapter | `createWallet`, `signMessage`, `signTransaction` working with AES-256-GCM encrypted local vault. API abstracted behind `SigningAdapter` interface. |
| Direct-pay: Solana USDC | `pay()` successfully sends USDC on Solana devnet via OWS-signed transaction. Event emitted with outcome. |
| Direct-pay: Base USDC | Same as above for Base testnet. |
| AgentCard integration | Card provisioned via AgentCard API. MPP SPT payment constructed and executed. Spend sync with policy limits. |

**Hackathon Week 3 (Apr 20-26): Integration + Onboarding**

| Deliverable | Acceptance Criteria |
|---|---|
| MCP server connected to live backend | Events flow from runtime → fullstack dev's Go backend → database. Traces queryable via API. |
| `npx rhemos onboard` | CLI provisions OWS vault OR AgentCard, registers fleet with 3 agents, fires test `pay()` to a known 402 endpoint, prints dashboard URL. Total time < 2 minutes. |
| @rhemos/sdk package | `pay(resource)` exported as framework-agnostic TypeScript function. Works standalone or via MCP. |
| Real 402 endpoints | At least 2 real APIs returning 402 that agents can pay through Rhemos. Not mocks. |

**Hackathon Week 4 (Apr 27 - May 3): Polish + Differentiation**

| Deliverable | Acceptance Criteria |
|---|---|
| Multi-standard demo flow | Single agent hits 3 different 402 endpoints (x402, MPP, L402). All detected and paid automatically. All traces captured. |
| L402 support | Lightning payment via L402 standard working end-to-end (LND/CLN client or hosted node). |
| Cross-chain: CCTP bridge | Solana USDC → Base USDC via CCTP. Bridge scoring logged in trace. |
| Kill switch | `rhemos.set_policy({ kill_switch: true })` pauses all fleet payments immediately. Dashboard reflects frozen state. |
| Edge case hardening | Graceful handling of: unknown standard, insufficient balance, network timeout, bridge failure. All produce structured errors and traces. |

**Hackathon Week 5 (May 4-11): Demo**

| Deliverable | Acceptance Criteria |
|---|---|
| Demo script rehearsed | Acts 1-2 from positioning doc work end-to-end without manual intervention. |
| `npx rhemos onboard` works on clean machine | Tested on fresh environment. Under 2 minutes. |

---

## Workstream 2: Intelligence Layer (Fullstack Dev)

### Scope

Everything downstream of a payment event — store, index, query, replay. Plus the Go backend API that serves the dashboard and the real-time feed. You make Rhemos's intelligence visible and queryable.

### Out of Scope

Payment execution, standard detection, policy enforcement (these are Sean's runtime). Dashboard UI (that's the designer's). You expose APIs — others produce events and consume endpoints.

### Tech Stack

- Go (backend API server, high-throughput event processing)
- PostgreSQL + event stream (payment_events append-only, full intelligence schema)
- Supabase Realtime or native WebSocket for live feed
- Drizzle ORM for schema management (or raw SQL if Go-native)

### Week-by-Week

**Pre-Hackathon (Mar 30 - Apr 5): Schema + Scaffold**

| Deliverable | Acceptance Criteria |
|---|---|
| Database schema implemented | All tables from PRD section 7.4: `payment_events`, `payment_traces`, `payment_edges`, `bridge_executions`, `policy_decisions`, `task_attributions`, `vendor_registry`. Migrations run cleanly. |
| Event ingestion pipeline | Accepts `PaymentEvent` + `PaymentTrace` from runtime (via HTTP POST or event bus). Writes to database. Returns confirmation. Handles duplicate events idempotently. |

**Hackathon Week 1 (Apr 6-12): API Foundation**

| Deliverable | Acceptance Criteria |
|---|---|
| Vendor registry seed | AgentCash 333 endpoints seeded as Day 1 vendor_registry data. Schema includes: domain, supported_standards, uptime_pct, avg_latency_ms, success_rate, last_seen. |
| Fleet stats endpoint | `GET /api/fleet/stats` returns: total_spend_today, total_spend_alltime, active_agent_count, blocked_payment_count, top_vendor_by_spend. Computed from payment_events. |
| Agent endpoints | `GET /api/fleet/agents` returns paginated agent list with daily spend, status, last active. `GET /api/fleet/agents/:id` returns agent detail with recent events. |
| Event endpoints | `GET /api/events` returns paginated, filterable event list (by agent, domain, outcome, date range). `GET /api/events/:id` returns event with linked trace. |

**Hackathon Week 2 (Apr 13-19): Traces + Policy + Real-Time**

| Deliverable | Acceptance Criteria |
|---|---|
| Trace endpoints | `GET /api/traces/:id` returns full trace with all fields from Contract 2. |
| Policy CRUD | `GET/PUT /api/policy` for fleet-level. `GET/PUT /api/policy/agents/:id` for per-agent overrides. Writes sync back to runtime. |
| WebSocket event stream | `WS /api/events/stream` pushes new PaymentEvent JSON on every ingested event. Supports multiple concurrent subscribers. |
| Payment graph edges | `payment_edges` populated on every event. Tracks: from_agent → to_service, delegation_depth, cumulative_spend. Enables "who pays whom" queries. |

**Hackathon Week 3 (Apr 20-26): Replay + Integration**

| Deliverable | Acceptance Criteria |
|---|---|
| Decision replay engine | `POST /api/traces/:id/replay` reconstructs agent context from `replay_snapshot`, re-runs policy evaluation, returns `{ replayed_outcome, diff_from_original, changed_rules }`. Does NOT execute a real payment — sandbox only. |
| End-to-end data flow verified | Sean's runtime emits events → ingestion pipeline stores → API serves → Designer's dashboard renders. Full loop working with real (non-mock) data. |
| Task outcome linking | When an agent's task completes or fails after a payment, link the outcome back to the trace via `task_outcome` + `task_outcome_linked_at`. |
| Vendor intelligence auto-build | On every payment event, update vendor_registry: recalculate success_rate, avg_latency_ms, last_seen, supported_standards for the target domain. No manual curation — purely auto-built from transaction data. |

**Hackathon Week 4 (Apr 27 - May 3): Polish + Differentiation**

| Deliverable | Acceptance Criteria |
|---|---|
| Replay with variable modification | Replay endpoint accepts optional `policy_overrides` parameter. "What would have happened if daily_limit was $100 instead of $500?" Returns counterfactual result. |
| Vendor intelligence view API | `GET /api/vendors` returns ranked vendor list with reliability scores, latency, standards supported, total spend through vendor. Filterable by success_rate threshold. |
| Cost attribution | `task_attributions` table populated: for a given root task, sum all leaf payment events to get total_cost_usd. API endpoint to query. |
| Performance | Event ingestion handles 100+ events/second. API responses < 200ms for dashboard queries. WebSocket delivers events within 500ms of ingestion. |

**Hackathon Week 5 (May 4-11): Demo**

| Deliverable | Acceptance Criteria |
|---|---|
| Demo data seeded | If real traffic is insufficient, seed database with realistic payment events covering: multi-standard, policy blocks, cross-chain bridges, varying vendors. Traces are complete and replayable. |
| Replay demo rehearsed | Acts 4-5 from positioning doc work end-to-end. Replay produces meaningful diff output. |

---

## Workstream 3: Dashboard + Design (Designer)

### Scope

Everything the judge sees on screen. The dashboard is the visual proof that Rhemos is production-grade, not a terminal demo. You also own brand identity, the landing page, onboarding UX, and presentation materials.

### Out of Scope

Backend API implementation, payment runtime logic, database schema. You consume APIs — others build them. Where APIs aren't ready, build against mock data that matches Contract 3.

### Tech Stack

- TanStack Start (existing monorepo app framework)
- Tailwind CSS 4 + Shadcn/ui (existing component library)
- Rhemify brand tokens (extend for Rhemos)
- Figma (wireframes + design system)
- Framer Motion or similar (dashboard animations)

### Design Principles

- **Dark theme** for dashboard (existing `.dark` selector in monorepo)
- **DM Mono** for all technical values: transaction IDs, amounts, timestamps, payment standards
- **Inter** for body text and labels
- **Brand accent** `--color-rhm-accent` (#C8F03A) for success states and key CTAs
- **Information density** — judges need to see a lot of data in the demo. Optimize for density over whitespace.
- **Real-time feel** — subtle animations on new events, live counters, pulse indicators for active agents

### Week-by-Week

**Pre-Hackathon (Mar 30 - Apr 5): Design System + Wireframes**

| Deliverable | Acceptance Criteria |
|---|---|
| Rhemos design tokens | Color palette, typography scale, spacing, component patterns defined. Published as CSS variables in `packages/ui/globals.css`. Reviewed by team. |
| Dashboard wireframes | All views wireframed in Figma: fleet overview, agent detail, event feed, decision trace viewer, policy editor. Reviewed by team. |
| Component inventory | List of all UI components needed. Map to existing Shadcn components vs custom builds. Estimate effort per component. |
| Onboarding UX design | Terminal output design for `npx rhemos onboard`. Success states, error states, progress indicators. Mockup of what the CLI prints at each step. |

**Hackathon Week 1 (Apr 6-12): Dashboard Scaffold**

| Deliverable | Acceptance Criteria |
|---|---|
| Dashboard layout + routing | Dashboard shell with sidebar navigation, header with fleet status indicator. Routes for: overview, agents, events, traces, policy, vendors. Dark theme applied. |
| Fleet overview page | Stat cards: total spend (today + all-time), active agents, blocked payments, top vendor. Built with mock data matching Contract 3 response shapes. |
| Agent table | Sortable table: agent name, status (active/frozen/idle), daily spend vs limit (progress bar), last active timestamp, action buttons. |
| Live event feed | Scrolling feed of payment events. Each row: timestamp, agent, domain, amount, standard badge (x402/MPP/L402 color-coded), outcome badge (success/blocked/failed). New events animate in from top. |

**Hackathon Week 2 (Apr 13-19): Core Views**

| Deliverable | Acceptance Criteria |
|---|---|
| Decision trace viewer | Full-page view for a single trace. Sections: Agent Context (task description + step), Trigger (402 response with standard badge), Alternatives Evaluated (list with rejection reasons), Policy Rules (pass/flag/block with values), Instrument Selection (why this path), Outcome (success/fail with task link). Expandable/collapsible sections. |
| Policy editor | View current fleet policy. Inline edit for: daily_limit (number input), max_per_tx, approval_threshold, allowed_domains (tag input), allowed_standards (checkboxes). Save calls `PUT /api/policy`. Show "policy updated" confirmation. |
| Connect to mock API | All dashboard views work against a local mock API server that returns data matching Contract 3. Designer can develop independently of backend availability. |

**Hackathon Week 3 (Apr 20-26): Real Data Integration**

| Deliverable | Acceptance Criteria |
|---|---|
| Switch from mock to real API | All views connected to fullstack dev's live Go backend. Data flows end-to-end. |
| WebSocket live feed | Event feed subscribes to `WS /api/events/stream`. New events appear in real-time without page refresh. |
| Decision replay UI | Button on trace viewer: "Replay Decision." Opens modal showing: original outcome, replayed outcome, diff. Supports policy override inputs (change a limit, re-run). |
| Agent detail page | Click agent row → detail page with: agent config, wallet manifest summary, spend chart (daily), recent events, active policy (fleet + overrides). |

**Hackathon Week 4 (Apr 27 - May 3): Polish + Marketing**

| Deliverable | Acceptance Criteria |
|---|---|
| Vendor intelligence view | Table: domain, success rate (color-coded), avg latency, standards supported (badges), total spend, last seen. Sortable by reliability. |
| Kill switch UI | Big red button in fleet overview header. Confirms before activating. Dashboard enters "FROZEN" state with visual indicator on all agent rows. |
| Landing page | rhemos.com — hero section with one-liner, "how it works" (3-step), competitive positioning visual, CTA to docs/onboard. Matches Rhemos brand. |
| Responsive polish | Dashboard works at 1280px+ (demo will be on a laptop screen). No broken layouts. |
| Loading + empty states | Skeleton loaders for all data views. Empty states with helpful messaging ("No events yet — run your first payment"). |

**Hackathon Week 5 (May 4-11): Demo**

| Deliverable | Acceptance Criteria |
|---|---|
| Presentation slides | 7-slide deck following narrative arc from positioning doc. Consistent with Rhemos brand. |
| Demo video assets | If submission requires a video: screen recording setup, script reviewed, transitions planned. |
| Visual QA pass | Every dashboard view screenshot-reviewed. No placeholder text, no broken styles, no console errors visible. |

---

## Demo Checklist

Each act from the [positioning doc](./hackathon-positioning.md) mapped to workstream responsibilities.

### Act 1: Zero to Paying (60s)

| Task | Owner | Status |
|---|---|---|
| `npx rhemos onboard` provisions wallet + fleet | Sean | |
| Test `pay()` fires to real 402 endpoint | Sean | |
| Payment event stored in database | Fullstack Dev | |
| Dashboard shows first transaction in live feed | Designer | |
| Terminal output is clean and branded | Designer | |

### Act 2: Multi-Standard in Action (60s)

| Task | Owner | Status |
|---|---|---|
| Agent hits x402 endpoint, standard detected, payment executes | Sean | |
| Agent hits MPP endpoint, same API call, different routing | Sean | |
| Agent hits L402 endpoint, Lightning payment executes | Sean | |
| All three events with correct standard metadata in database | Fullstack Dev | |
| Live feed shows three payments with color-coded standard badges | Designer | |

### Act 3: Policy Engine Catches Something (45s)

| Task | Owner | Status |
|---|---|---|
| Agent attempts payment outside allowed_domains | Sean | |
| Policy engine returns structured rejection | Sean | |
| Rejection logged as policy_decision event | Fullstack Dev | |
| Dashboard live feed shows blocked payment with red badge | Designer | |
| Policy rule that fired is visible in event detail | Designer | |

### Act 4: Flight Recorder Moment (90s)

| Task | Owner | Status |
|---|---|---|
| Trace data captured with full context on every payment | Sean | |
| Trace queryable via API with all fields populated | Fullstack Dev | |
| Replay engine returns counterfactual result | Fullstack Dev | |
| Trace viewer renders all sections (context, trigger, alternatives, policy, outcome) | Designer | |
| Replay modal shows original vs replayed outcome | Designer | |

### Act 5: Fleet Dashboard (45s)

| Task | Owner | Status |
|---|---|---|
| All stat cards show accurate live data | Fullstack Dev | |
| Agent table populated with correct per-agent data | Fullstack Dev | |
| Fleet overview is visually polished and information-dense | Designer | |
| Policy editor allows real-time policy changes | Designer + Fullstack Dev | |
| Overall visual impression: "this is production-ready" | Designer | |

---

## Communication

- **Daily async standup** — each person posts: what they shipped, what they're working on, any blockers
- **Contract review points** — week 1 (schemas), week 3 (API shapes), hackathon week 1 (integration test)
- **Integration days** — pre-hackathon week 5 and hackathon week 1 are dedicated integration time. All three workstreams connect.
- **Demo rehearsals** — hackathon week 4 (dry run), week 5 (final rehearsal with timing)

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| No real 402 endpoints available for demo | Demo uses mocks, less impressive | Sean scouts real 402 APIs in pre-hackathon. Fallback: deploy own 402 test server. |
| Backend API delayed, dashboard blocked | Designer builds against mocks indefinitely | Contract 3 defined early. Designer builds against mock server from day 1. Swap to real API is a URL change. |
| OWS or AgentCard integration is harder than expected | Onboarding flow breaks | Sean starts integration early (pre-hackathon week 3). Fallback: Privy-only signing for demo. |
| Replay engine complexity | No replay in demo | Fullstack dev starts replay in hackathon week 1. Fallback: show trace viewer without replay (still strong). |
| Cross-chain bridge fails in demo | Embarrassing live failure | Pre-record the bridge demo as backup. Use testnet with pre-funded wallets. |
| Team velocity slower than planned | Not all demo acts ready | Demo acts are priority-ordered. Acts 1-3 are must-have. Acts 4-5 are the differentiators but the demo still works without replay. |
