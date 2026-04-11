# Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic rules engine that evaluates 6 intelligence rules (VH-1, VH-2, SA-1, SA-2, SA-3, RO-1) on every ingested payment event and records resulting actions in `intelligence_actions`.

**Architecture:** New `internal/engine/` package in the Go server. Called from the ingest handler after storing event/trace/decisions and after updating materialized aggregates. Each rule is isolated in its own file implementing a `Rule` interface. Context (vendor stats, agent aggregates, fleet aggregates) is fetched once per evaluation from new Convex queries backed by two new materialized tables.

**Tech Stack:** Go 1.23 (standard `testing` package), Convex TypeScript mutations/queries, Gin (existing), module `github.com/rhemify/server`

**Design spec:** `docs/superpowers/specs/2026-04-08-rules-engine-design.md`

---

## File Map

**New files:**
- `convex/aggregates.ts` — agent/fleet aggregate mutations + queries + edge upsert
- `convex/intelligence.ts` — insertAction mutation
- `convex/crons.ts` — scheduled vendor auto-unblock
- `apps/server/internal/engine/rule.go` — Severity, Action, Rule interface
- `apps/server/internal/engine/context.go` — EvalContext and its sub-structs
- `apps/server/internal/engine/dedup.go` — in-memory alert deduplication cache
- `apps/server/internal/engine/engine.go` — orchestrator: buildContext, Evaluate, persist, applyAutoAction
- `apps/server/internal/engine/vh1_block_vendor.go` + `_test.go`
- `apps/server/internal/engine/vh2_slow_vendor.go` + `_test.go`
- `apps/server/internal/engine/sa1_agent_anomaly.go` + `_test.go`
- `apps/server/internal/engine/sa2_unusual_payment.go` + `_test.go`
- `apps/server/internal/engine/sa3_fleet_spike.go` + `_test.go`
- `apps/server/internal/engine/ro1_bridge_warning.go` + `_test.go`

**Modified files:**
- `convex/schema.ts` — new aggregate tables; vendor_registry + intelligence_actions extensions
- `convex/vendors.ts` — add updateStats, getStatsForEngine, blockVendor, processAutoUnblocks
- `apps/server/internal/handler/ingest.go` — add aggregate mutations + engine.Evaluate call
- `apps/server/internal/router/router.go` — create engine, pass to ingest handler

---

## Task 1: Convex Schema Changes

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Read the Convex guidelines**

```bash
cat convex/_generated/ai/guidelines.md
```

- [ ] **Step 2: Add new tables and extend existing ones in schema.ts**

In `convex/schema.ts`, make the following changes:

**a) Extend `vendor_registry`** — add optional fields for explicit blocking and tracking:

```typescript
  vendor_registry: defineTable({
    domain: v.string(),
    supported_standards: v.any(),
    success_rate: v.float64(),
    avg_latency_ms: v.float64(),
    uptime_pct: v.float64(),
    total_payments: v.float64(),
    total_successes: v.optional(v.float64()),   // NEW: for accurate success_rate
    last_seen_at: v.float64(),
    // Intelligence-managed blocking (explicit, not computed from success_rate)
    is_blocked: v.optional(v.boolean()),         // NEW
    blocked_reason: v.optional(v.string()),      // NEW
    blocked_at: v.optional(v.float64()),         // NEW: epoch ms
    blocked_until: v.optional(v.float64()),      // NEW: epoch ms, null = permanent
    block_count_24h: v.optional(v.float64()),    // NEW: for cooldown escalation
    last_blocked_at: v.optional(v.float64()),    // NEW: epoch ms
  }).index("by_domain", ["domain"]),
```

**b) Extend `intelligence_actions`** — make agent_id/domain optional, add missing fields:

```typescript
  intelligence_actions: defineTable({
    action_type: v.string(),
    trigger_rule: v.string(),
    evidence: v.any(),
    outcome: v.string(),
    operator_override: v.optional(v.string()),
    agent_id: v.optional(v.string()),            // changed: was required
    domain: v.optional(v.string()),              // changed: was required
    fleet_id: v.optional(v.string()),            // NEW
    trigger_event_id: v.optional(v.string()),    // NEW
    severity: v.optional(v.string()),            // NEW
    action_detail: v.optional(v.string()),       // NEW
    resolved_at: v.optional(v.float64()),
  })
    .index("by_action_type", ["action_type"])
    .index("by_agent", ["agent_id"])
    .index("by_outcome", ["outcome"]),
```

**c) Add `payment_edges` event_count field** — needed for SA-2 vendor context:

```typescript
  payment_edges: defineTable({
    from_agent_id: v.string(),
    to_service: v.string(),
    delegation_depth: v.float64(),
    cumulative_spend: v.float64(),
    event_count: v.optional(v.float64()),        // NEW: payments on this edge
    last_seen_at: v.float64(),
  })
    .index("by_agent", ["from_agent_id"])
    .index("by_service", ["to_service"])
    .index("by_agent_service", ["from_agent_id", "to_service"]),
```

**d) Add new table `agent_aggregates`** — before the closing `});`:

```typescript
  // Materialized per-agent spend aggregates for rules engine
  agent_aggregates: defineTable({
    agent_id: v.string(),
    fleet_id: v.string(),
    daily_spend: v.float64(),
    daily_spend_date: v.string(),      // "YYYY-MM-DD" UTC, reset trigger
    avg_daily_7d: v.float64(),         // EMA of daily spend
    avg_tx_amount: v.float64(),        // EMA of per-transaction amount
    total_events: v.float64(),
    active_days: v.float64(),          // days with at least one event
    success_rate: v.float64(),
    last_active: v.float64(),          // epoch ms
  })
    .index("by_agent", ["agent_id"])
    .index("by_fleet", ["fleet_id"]),
```

**e) Add new table `fleet_aggregates`**:

```typescript
  // Materialized per-fleet spend aggregates for rules engine
  fleet_aggregates: defineTable({
    fleet_id: v.string(),
    hourly_spend: v.float64(),
    hourly_spend_since: v.float64(),   // epoch ms: start of current 1h window
    avg_hourly_7d: v.float64(),        // EMA of hourly spend
    total_spend_today: v.float64(),
    today_date: v.string(),            // "YYYY-MM-DD" UTC, reset trigger
  }).index("by_fleet", ["fleet_id"]),
```

- [ ] **Step 3: Push schema to Convex**

```bash
cd /path/to/project && bunx convex dev --once
```

Expected: schema deploys without errors. If `bunx convex dev --once` is not available, run `bunx convex deploy` or start `bunx convex dev` and wait for deployment.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): add agent/fleet aggregates tables, extend vendor_registry and intelligence_actions for rules engine"
```

---

## Task 2: convex/aggregates.ts

**Files:**
- Create: `convex/aggregates.ts`

- [ ] **Step 1: Create convex/aggregates.ts with all mutations and queries**

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const ALPHA = 0.2; // EMA smoothing factor

// Called after every payment ingest to maintain per-agent spend aggregates.
export const updateAgent = mutation({
  args: {
    agent_id: v.string(),
    fleet_id: v.string(),
    amount: v.number(),
    outcome: v.string(),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().slice(0, 10);
    const isSuccess = args.outcome === "success";

    const existing = await ctx.db
      .query("agent_aggregates")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .unique();

    if (!existing) {
      await ctx.db.insert("agent_aggregates", {
        agent_id: args.agent_id,
        fleet_id: args.fleet_id,
        daily_spend: isSuccess ? args.amount : 0,
        daily_spend_date: today,
        avg_daily_7d: 0,
        avg_tx_amount: args.amount,
        total_events: 1,
        active_days: 1,
        success_rate: isSuccess ? 1.0 : 0.0,
        last_active: Date.now(),
      });
      return;
    }

    let daily_spend = existing.daily_spend;
    let avg_daily_7d = existing.avg_daily_7d;
    let active_days = existing.active_days;

    // Day rollover: apply yesterday's total to EMA, reset daily counter
    if (existing.daily_spend_date !== today) {
      avg_daily_7d =
        ALPHA * existing.daily_spend + (1 - ALPHA) * existing.avg_daily_7d;
      daily_spend = isSuccess ? args.amount : 0;
      active_days = existing.active_days + 1;
    } else {
      daily_spend = isSuccess
        ? existing.daily_spend + args.amount
        : existing.daily_spend;
    }

    const avg_tx_amount =
      ALPHA * args.amount + (1 - ALPHA) * existing.avg_tx_amount;
    const successVal = isSuccess ? 1.0 : 0.0;
    const success_rate =
      ALPHA * successVal + (1 - ALPHA) * existing.success_rate;

    await ctx.db.patch(existing._id, {
      daily_spend,
      daily_spend_date: today,
      avg_daily_7d,
      avg_tx_amount,
      total_events: existing.total_events + 1,
      active_days,
      success_rate,
      last_active: Date.now(),
    });
  },
});

// Called after every payment ingest to maintain per-fleet spend aggregates.
export const updateFleet = mutation({
  args: {
    fleet_id: v.string(),
    amount: v.number(),
    outcome: v.string(),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();
    const isSuccess = args.outcome === "success";
    const ONE_HOUR = 60 * 60 * 1000;

    const existing = await ctx.db
      .query("fleet_aggregates")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .unique();

    if (!existing) {
      await ctx.db.insert("fleet_aggregates", {
        fleet_id: args.fleet_id,
        hourly_spend: isSuccess ? args.amount : 0,
        hourly_spend_since: now,
        avg_hourly_7d: 0,
        total_spend_today: isSuccess ? args.amount : 0,
        today_date: today,
      });
      return;
    }

    let hourly_spend = existing.hourly_spend;
    let hourly_spend_since = existing.hourly_spend_since;
    let avg_hourly_7d = existing.avg_hourly_7d;
    let total_spend_today = existing.total_spend_today;

    // Day rollover
    if (existing.today_date !== today) {
      total_spend_today = isSuccess ? args.amount : 0;
    } else {
      total_spend_today = isSuccess
        ? existing.total_spend_today + args.amount
        : existing.total_spend_today;
    }

    // Hourly window rollover: apply completed window to EMA, start fresh
    if (now - existing.hourly_spend_since > ONE_HOUR) {
      avg_hourly_7d =
        ALPHA * existing.hourly_spend + (1 - ALPHA) * existing.avg_hourly_7d;
      hourly_spend = isSuccess ? args.amount : 0;
      hourly_spend_since = now;
    } else {
      hourly_spend = isSuccess
        ? existing.hourly_spend + args.amount
        : existing.hourly_spend;
    }

    await ctx.db.patch(existing._id, {
      hourly_spend,
      hourly_spend_since,
      avg_hourly_7d,
      total_spend_today,
      today_date: today,
    });
  },
});

// Upserts the payment_edges graph on every ingest.
export const upsertEdge = mutation({
  args: {
    agent_id: v.string(),
    domain: v.string(),
    amount: v.number(),
    outcome: v.string(),
  },
  handler: async (ctx, args) => {
    const isSuccess = args.outcome === "success";
    const existing = await ctx.db
      .query("payment_edges")
      .withIndex("by_agent_service", (q) =>
        q.eq("from_agent_id", args.agent_id).eq("to_service", args.domain)
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("payment_edges", {
        from_agent_id: args.agent_id,
        to_service: args.domain,
        delegation_depth: 0,
        cumulative_spend: isSuccess ? args.amount : 0,
        event_count: 1,
        last_seen_at: Date.now(),
      });
      return;
    }

    await ctx.db.patch(existing._id, {
      cumulative_spend: isSuccess
        ? existing.cumulative_spend + args.amount
        : existing.cumulative_spend,
      event_count: (existing.event_count ?? 0) + 1,
      last_seen_at: Date.now(),
    });
  },
});

// Read agent aggregates for rules engine context.
export const getAgentAggregates = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agent_aggregates")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .unique();
  },
});

// Read fleet aggregates for rules engine context.
export const getFleetAggregates = query({
  args: { fleet_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fleet_aggregates")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .unique();
  },
});

// Read (agent, domain) edge stats for SA-2 vendor context.
export const getEdgeStats = query({
  args: { agent_id: v.string(), domain: v.string() },
  handler: async (ctx, args) => {
    const edge = await ctx.db
      .query("payment_edges")
      .withIndex("by_agent_service", (q) =>
        q
          .eq("from_agent_id", args.agent_id)
          .eq("to_service", args.domain)
      )
      .unique();

    if (!edge) return null;

    const eventCount = edge.event_count ?? 0;
    return {
      event_count: eventCount,
      avg_payment: eventCount > 0 ? edge.cumulative_spend / eventCount : 0,
    };
  },
});
```

- [ ] **Step 2: Deploy and verify**

```bash
bunx convex dev --once
```

Expected: no TypeScript errors, functions appear in Convex dashboard.

- [ ] **Step 3: Commit**

```bash
git add convex/aggregates.ts
git commit -m "feat(convex): add aggregates mutations and queries for rules engine"
```

---

## Task 3: convex/vendors.ts Extensions + crons.ts

**Files:**
- Modify: `convex/vendors.ts`
- Create: `convex/crons.ts`

- [ ] **Step 1: Add updateStats, getStatsForEngine, blockVendor, processAutoUnblocks to vendors.ts**

Replace the entire contents of `convex/vendors.ts` with:

```typescript
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// GET /api/vendor/:domain — vendor status for SDK policy engine
export const getByDomain = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const vendor = await ctx.db
      .query("vendor_registry")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();

    if (!vendor) return null;

    return {
      domain: vendor.domain,
      // Explicit block takes precedence over success_rate computed block
      isBlocked: vendor.is_blocked === true || vendor.success_rate < 0.5,
      blockedReason: vendor.blocked_reason ?? null,
      successRate: vendor.success_rate,
      avgLatencyMs: vendor.avg_latency_ms,
      uptimePct: vendor.uptime_pct,
      totalPayments: vendor.total_payments,
      supportedStandards: vendor.supported_standards,
    };
  },
});

// Called after every payment ingest to update vendor reliability stats.
export const updateStats = mutation({
  args: {
    domain: v.string(),
    outcome: v.string(),
    standard: v.string(),
  },
  handler: async (ctx, args) => {
    const isSuccess = args.outcome === "success";
    const now = Date.now();

    const existing = await ctx.db
      .query("vendor_registry")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();

    if (!existing) {
      await ctx.db.insert("vendor_registry", {
        domain: args.domain,
        supported_standards: [args.standard],
        success_rate: isSuccess ? 1.0 : 0.0,
        avg_latency_ms: 0,
        uptime_pct: isSuccess ? 100 : 0,
        total_payments: 1,
        total_successes: isSuccess ? 1 : 0,
        last_seen_at: now,
      });
      return;
    }

    const standards: string[] = existing.supported_standards ?? [];
    if (!standards.includes(args.standard)) {
      standards.push(args.standard);
    }

    const total_payments = existing.total_payments + 1;
    const total_successes = (existing.total_successes ?? 0) + (isSuccess ? 1 : 0);
    const success_rate = total_successes / total_payments;

    await ctx.db.patch(existing._id, {
      supported_standards: standards,
      success_rate,
      total_payments,
      total_successes,
      uptime_pct: success_rate * 100,
      last_seen_at: now,
    });
  },
});

// Full vendor stats for the rules engine. Computes sliding window from raw events.
export const getStatsForEngine = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const vendor = await ctx.db
      .query("vendor_registry")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();

    // Sliding window: last 50 events within last 24h
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentEvents = await ctx.db
      .query("payment_events")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .order("desc")
      .take(50);
    const windowEvents = recentEvents.filter(
      (e) => e._creationTime >= oneDayAgo
    );

    if (windowEvents.length === 0) {
      if (!vendor) return null;
      return {
        domain: vendor.domain,
        success_rate: vendor.success_rate,
        avg_latency_ms: vendor.avg_latency_ms,
        event_count: vendor.total_payments,
        failure_streak: 0,
        last_10_outcomes: [] as string[],
        is_blocked: vendor.is_blocked ?? false,
        blocked_until: vendor.blocked_until ?? null,
        block_count_24h: vendor.block_count_24h ?? 0,
      };
    }

    const successes = windowEvents.filter((e) => e.outcome === "success").length;
    const success_rate = successes / windowEvents.length;

    // Consecutive failures from most recent event
    let failure_streak = 0;
    for (const event of windowEvents) {
      if (event.outcome !== "success") failure_streak++;
      else break;
    }

    const last_10_outcomes = windowEvents.slice(0, 10).map((e) => e.outcome);

    return {
      domain: args.domain,
      success_rate,
      avg_latency_ms: vendor?.avg_latency_ms ?? 0,
      event_count: windowEvents.length,
      failure_streak,
      last_10_outcomes,
      is_blocked: vendor?.is_blocked ?? false,
      blocked_until: vendor?.blocked_until ?? null,
      block_count_24h: vendor?.block_count_24h ?? 0,
    };
  },
});

// Blocks a vendor domain with escalating cooldowns:
//   1st block in 24h: auto-unblock after 1h
//   2nd block in 24h: auto-unblock after 6h
//   3rd+ block in 24h: no auto-unblock (operator review required)
export const blockVendor = mutation({
  args: {
    domain: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const oneDayAgo = now - 24 * ONE_HOUR;

    const vendor = await ctx.db
      .query("vendor_registry")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();

    // Count how many times we've blocked this vendor in the last 24h
    const priorBlockCount =
      vendor && (vendor.last_blocked_at ?? 0) > oneDayAgo
        ? (vendor.block_count_24h ?? 0)
        : 0;

    let blocked_until: number | undefined;
    if (priorBlockCount === 0) {
      blocked_until = now + ONE_HOUR; // 1st block: 1h
    } else if (priorBlockCount === 1) {
      blocked_until = now + SIX_HOURS; // 2nd block: 6h
    }
    // 3rd+: blocked_until stays undefined (permanent until operator review)

    if (!vendor) {
      await ctx.db.insert("vendor_registry", {
        domain: args.domain,
        supported_standards: [],
        success_rate: 0,
        avg_latency_ms: 0,
        uptime_pct: 0,
        total_payments: 0,
        total_successes: 0,
        last_seen_at: now,
        is_blocked: true,
        blocked_reason: args.reason,
        blocked_at: now,
        blocked_until,
        block_count_24h: 1,
        last_blocked_at: now,
      });
    } else {
      await ctx.db.patch(vendor._id, {
        is_blocked: true,
        blocked_reason: args.reason,
        blocked_at: now,
        blocked_until,
        block_count_24h: priorBlockCount + 1,
        last_blocked_at: now,
      });
    }
  },
});

// Runs every 5 minutes via cron to auto-unblock vendors whose cooldown has passed.
export const processAutoUnblocks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const blockedVendors = await ctx.db
      .query("vendor_registry")
      .filter((q) => q.eq(q.field("is_blocked"), true))
      .collect();

    for (const vendor of blockedVendors) {
      if (vendor.blocked_until && vendor.blocked_until <= now) {
        await ctx.db.patch(vendor._id, {
          is_blocked: false,
          blocked_reason: undefined,
          blocked_until: undefined,
        });
      }
    }
  },
});
```

- [ ] **Step 2: Create convex/crons.ts**

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "auto-unblock vendors",
  { minutes: 5 },
  internal.vendors.processAutoUnblocks
);

export default crons;
```

- [ ] **Step 3: Deploy and verify**

```bash
bunx convex dev --once
```

Expected: no errors. `vendors:updateStats`, `vendors:getStatsForEngine`, `vendors:blockVendor` appear as public functions. `vendors:processAutoUnblocks` appears as an internal function. Cron job registered.

- [ ] **Step 4: Commit**

```bash
git add convex/vendors.ts convex/crons.ts
git commit -m "feat(convex): add vendor stats updates, engine query, block/unblock with cooldown, scheduled auto-unblock"
```

---

## Task 4: convex/intelligence.ts

**Files:**
- Create: `convex/intelligence.ts`

- [ ] **Step 1: Create convex/intelligence.ts**

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Records an intelligence action taken by the rules engine.
export const insertAction = mutation({
  args: {
    action_type: v.string(),
    severity: v.string(),
    trigger_rule: v.string(),
    trigger_event_id: v.optional(v.string()),
    evidence: v.any(),
    action_detail: v.string(),
    agent_id: v.optional(v.string()),
    domain: v.optional(v.string()),
    fleet_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("intelligence_actions", {
      action_type: args.action_type,
      trigger_rule: args.trigger_rule,
      evidence: args.evidence,
      outcome: "pending",
      severity: args.severity,
      action_detail: args.action_detail,
      agent_id: args.agent_id,
      domain: args.domain,
      fleet_id: args.fleet_id,
      trigger_event_id: args.trigger_event_id,
    });
  },
});
```

- [ ] **Step 2: Deploy and verify**

```bash
bunx convex dev --once
```

Expected: `intelligence:insertAction` appears as a public function.

- [ ] **Step 3: Commit**

```bash
git add convex/intelligence.ts
git commit -m "feat(convex): add intelligence:insertAction mutation"
```

---

## Task 5: Go Engine Types (rule.go + context.go)

**Files:**
- Create: `apps/server/internal/engine/rule.go`
- Create: `apps/server/internal/engine/context.go`

- [ ] **Step 1: Create rule.go**

```go
package engine

// Severity defines how impactful an intelligence action is.
type Severity string

const (
	SeverityLog     Severity = "LOG"
	SeverityFlag    Severity = "FLAG"
	SeverityAlert   Severity = "ALERT"
	SeverityAutoAct Severity = "AUTO_ACT"
)

// Action is produced by a rule when its condition is met.
type Action struct {
	ActionType   string
	Severity     Severity
	TriggerRule  string
	Evidence     map[string]interface{}
	ActionDetail string
	Domain       string
	AgentID      string
	FleetID      string
}

// Rule is the interface every intelligence rule implements.
// Evaluate returns nil if the rule condition is not met.
type Rule interface {
	ID() string
	Evaluate(event map[string]interface{}, ctx *EvalContext) *Action
}
```

- [ ] **Step 2: Create context.go**

```go
package engine

// VendorStats is the derived context for vendor health rules (VH-1, VH-2).
// Computed from a sliding window of the last 50 events within 24h.
type VendorStats struct {
	Domain         string
	SuccessRate    float64  // sliding window success rate
	AvgLatencyMs   float64  // from vendor_registry
	EventCount     int64    // events in sliding window
	FailureStreak  int      // consecutive failures from most recent
	Last10Outcomes []string // last 10 outcome strings
	IsBlocked      bool
	BlockedUntil   float64 // epoch ms, 0 = permanent/not set
	BlockCount24h  int64
}

// AgentAggregates is derived context for agent spend rules (SA-1, SA-2).
type AgentAggregates struct {
	AgentID     string
	DailySpend  float64
	AvgDaily7d  float64
	AvgTxAmount float64
	TotalEvents int64
	ActiveDays  int64
}

// FleetAggregates is derived context for fleet-level rules (SA-3).
type FleetAggregates struct {
	FleetID     string
	HourlySpend float64
	AvgHourly7d float64
}

// BridgeInfo is extracted from the payment trace for bridge rules (RO-1).
type BridgeInfo struct {
	BridgeCostPct float64
	BridgeCostAbs float64
	Protocol      string
	ChainFrom     string
	ChainTo       string
}

// EvalContext holds all derived data needed to evaluate rules.
// Built once per evaluation; shared across all rules.
type EvalContext struct {
	Vendor     *VendorStats     // nil if no domain on event
	Agent      *AgentAggregates // nil if agent not yet in aggregates
	Fleet      *FleetAggregates // nil if fleet not yet in aggregates
	Bridge     *BridgeInfo      // nil if no bridge was used
	EdgeCount  int64            // payments from this agent to this domain
	EdgeAvgPmt float64          // avg payment amount for this (agent, domain) pair
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd apps/server && go build ./internal/engine/...
```

Expected: no errors (empty package compiles fine with just type definitions).

- [ ] **Step 4: Commit**

```bash
git add apps/server/internal/engine/rule.go apps/server/internal/engine/context.go
git commit -m "feat(engine): add Rule interface and EvalContext types"
```

---

## Task 6: Go dedup.go

**Files:**
- Create: `apps/server/internal/engine/dedup.go`
- Create: `apps/server/internal/engine/dedup_test.go`

- [ ] **Step 1: Write the failing test**

Create `apps/server/internal/engine/dedup_test.go`:

```go
package engine

import (
	"testing"
	"time"
)

func TestDedupCache_SuppressesWithinWindow(t *testing.T) {
	d := NewDedupCache()

	// First call: should not suppress
	if d.ShouldSuppress("SA-1", "agent-1", 24*time.Hour) {
		t.Error("first call should not suppress")
	}

	// Second call same key within window: should suppress
	if !d.ShouldSuppress("SA-1", "agent-1", 24*time.Hour) {
		t.Error("second call within window should suppress")
	}
}

func TestDedupCache_DifferentSubjectNotSuppressed(t *testing.T) {
	d := NewDedupCache()

	d.ShouldSuppress("SA-1", "agent-1", 24*time.Hour)

	// Different agent should not be suppressed
	if d.ShouldSuppress("SA-1", "agent-2", 24*time.Hour) {
		t.Error("different subject should not suppress")
	}
}

func TestDedupCache_DifferentRuleNotSuppressed(t *testing.T) {
	d := NewDedupCache()

	d.ShouldSuppress("SA-1", "agent-1", 24*time.Hour)

	// Different rule ID should not suppress
	if d.ShouldSuppress("SA-3", "agent-1", 6*time.Hour) {
		t.Error("different rule should not suppress")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && go test ./internal/engine/... -run TestDedupCache -v
```

Expected: FAIL — `NewDedupCache undefined`

- [ ] **Step 3: Create dedup.go**

```go
package engine

import (
	"fmt"
	"sync"
	"time"
)

// DedupCache suppresses repeated alerts within a configurable time window.
// In-memory only — resets on server restart (acceptable: missed alert, not missed block).
type DedupCache struct {
	mu   sync.Mutex
	seen map[string]struct{}
}

func NewDedupCache() *DedupCache {
	return &DedupCache{seen: make(map[string]struct{})}
}

// ShouldSuppress returns true if this (ruleID, subject) pair has already fired
// within the current window bucket. Records the key on first call.
func (d *DedupCache) ShouldSuppress(ruleID, subject string, window time.Duration) bool {
	key := d.key(ruleID, subject, window)
	d.mu.Lock()
	defer d.mu.Unlock()
	if _, exists := d.seen[key]; exists {
		return true
	}
	d.seen[key] = struct{}{}
	return false
}

// key produces a stable string bucketed to the window duration.
// e.g. for a 24h window on 2026-04-08T15:30:00Z, bucket = start of that 24h period.
func (d *DedupCache) key(ruleID, subject string, window time.Duration) string {
	bucket := time.Now().Truncate(window).Unix()
	return fmt.Sprintf("%s:%s:%d", ruleID, subject, bucket)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/server && go test ./internal/engine/... -run TestDedupCache -v
```

Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/internal/engine/dedup.go apps/server/internal/engine/dedup_test.go
git commit -m "feat(engine): add DedupCache for alert deduplication"
```

---

## Task 7: Go engine.go

**Files:**
- Create: `apps/server/internal/engine/engine.go`

- [ ] **Step 1: Create engine.go**

```go
package engine

import (
	"encoding/json"
	"log"
	"time"

	cx "github.com/rhemify/server/internal/convex"
)

// Engine orchestrates rule evaluation on every payment event.
// All errors are logged and swallowed — engine failures must never block ingest.
type Engine struct {
	convex *cx.Client
	dedup  *DedupCache
	rules  []Rule
}

// New creates an Engine with all registered rules.
func New(c *cx.Client) *Engine {
	return &Engine{
		convex: c,
		dedup:  NewDedupCache(),
		rules: []Rule{
			&VH1BlockVendor{},
			&VH2SlowVendor{},
			&SA1AgentAnomaly{},
			&SA2UnusualPayment{},
			&SA3FleetSpike{},
			&RO1BridgeWarning{},
		},
	}
}

// Evaluate runs all rules against the event+trace and persists any resulting actions.
func (e *Engine) Evaluate(event, trace map[string]interface{}) {
	ctx := e.buildContext(event, trace)
	for _, rule := range e.rules {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("engine: rule %s panicked: %v", rule.ID(), r)
				}
			}()
			action := rule.Evaluate(event, ctx)
			if action == nil {
				return
			}
			if e.shouldDedup(action) {
				return
			}
			e.persistAction(action, event)
			if action.Severity == SeverityAutoAct {
				e.applyAutoAction(action)
			}
		}()
	}
}

func (e *Engine) shouldDedup(action *Action) bool {
	switch action.TriggerRule {
	case "VH-2":
		return e.dedup.ShouldSuppress("VH-2", action.Domain, 24*time.Hour)
	case "SA-1":
		return e.dedup.ShouldSuppress("SA-1", action.AgentID, 24*time.Hour)
	case "SA-3":
		return e.dedup.ShouldSuppress("SA-3", action.FleetID, 6*time.Hour)
	case "RO-1":
		chainFrom, _ := action.Evidence["chain_from"].(string)
		chainTo, _ := action.Evidence["chain_to"].(string)
		subject := action.AgentID + ":" + chainFrom + "->" + chainTo
		return e.dedup.ShouldSuppress("RO-1", subject, 24*time.Hour)
	default:
		return false
	}
}

func (e *Engine) buildContext(event, trace map[string]interface{}) *EvalContext {
	ctx := &EvalContext{}
	agentID := safeStr(event, "agent_id")
	fleetID := safeStr(event, "fleet_id")
	domain := safeStr(event, "domain")

	if domain != "" {
		ctx.Vendor = e.fetchVendorStats(domain)
		ctx.EdgeCount, ctx.EdgeAvgPmt = e.fetchEdgeStats(agentID, domain)
	}
	if agentID != "" {
		ctx.Agent = e.fetchAgentAggregates(agentID)
	}
	if fleetID != "" {
		ctx.Fleet = e.fetchFleetAggregates(fleetID)
	}
	ctx.Bridge = extractBridgeInfo(event, trace)
	return ctx
}

func (e *Engine) fetchVendorStats(domain string) *VendorStats {
	raw, err := e.convex.Query("vendors:getStatsForEngine", map[string]interface{}{"domain": domain})
	if err != nil || string(raw) == "null" {
		return nil
	}
	var v struct {
		Domain         string   `json:"domain"`
		SuccessRate    float64  `json:"success_rate"`
		AvgLatencyMs   float64  `json:"avg_latency_ms"`
		EventCount     float64  `json:"event_count"`
		FailureStreak  int      `json:"failure_streak"`
		Last10Outcomes []string `json:"last_10_outcomes"`
		IsBlocked      bool     `json:"is_blocked"`
		BlockedUntil   float64  `json:"blocked_until"`
		BlockCount24h  float64  `json:"block_count_24h"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil
	}
	return &VendorStats{
		Domain:         v.Domain,
		SuccessRate:    v.SuccessRate,
		AvgLatencyMs:   v.AvgLatencyMs,
		EventCount:     int64(v.EventCount),
		FailureStreak:  v.FailureStreak,
		Last10Outcomes: v.Last10Outcomes,
		IsBlocked:      v.IsBlocked,
		BlockedUntil:   v.BlockedUntil,
		BlockCount24h:  int64(v.BlockCount24h),
	}
}

func (e *Engine) fetchAgentAggregates(agentID string) *AgentAggregates {
	raw, err := e.convex.Query("aggregates:getAgentAggregates", map[string]interface{}{"agent_id": agentID})
	if err != nil || string(raw) == "null" {
		return nil
	}
	var a struct {
		AgentID     string  `json:"agent_id"`
		DailySpend  float64 `json:"daily_spend"`
		AvgDaily7d  float64 `json:"avg_daily_7d"`
		AvgTxAmount float64 `json:"avg_tx_amount"`
		TotalEvents float64 `json:"total_events"`
		ActiveDays  float64 `json:"active_days"`
	}
	if err := json.Unmarshal(raw, &a); err != nil {
		return nil
	}
	return &AgentAggregates{
		AgentID:     a.AgentID,
		DailySpend:  a.DailySpend,
		AvgDaily7d:  a.AvgDaily7d,
		AvgTxAmount: a.AvgTxAmount,
		TotalEvents: int64(a.TotalEvents),
		ActiveDays:  int64(a.ActiveDays),
	}
}

func (e *Engine) fetchFleetAggregates(fleetID string) *FleetAggregates {
	raw, err := e.convex.Query("aggregates:getFleetAggregates", map[string]interface{}{"fleet_id": fleetID})
	if err != nil || string(raw) == "null" {
		return nil
	}
	var f struct {
		FleetID     string  `json:"fleet_id"`
		HourlySpend float64 `json:"hourly_spend"`
		AvgHourly7d float64 `json:"avg_hourly_7d"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		return nil
	}
	return &FleetAggregates{
		FleetID:     f.FleetID,
		HourlySpend: f.HourlySpend,
		AvgHourly7d: f.AvgHourly7d,
	}
}

func (e *Engine) fetchEdgeStats(agentID, domain string) (int64, float64) {
	raw, err := e.convex.Query("aggregates:getEdgeStats", map[string]interface{}{
		"agent_id": agentID,
		"domain":   domain,
	})
	if err != nil || string(raw) == "null" {
		return 0, 0
	}
	var edge struct {
		EventCount float64 `json:"event_count"`
		AvgPayment float64 `json:"avg_payment"`
	}
	if err := json.Unmarshal(raw, &edge); err != nil {
		return 0, 0
	}
	return int64(edge.EventCount), edge.AvgPayment
}

// extractBridgeInfo pulls bridge cost data from the trace's economic_rationality_check field.
func extractBridgeInfo(event, trace map[string]interface{}) *BridgeInfo {
	if trace == nil {
		return nil
	}
	erc, ok := trace["economic_rationality_check"].(map[string]interface{})
	if !ok {
		return nil
	}
	costPct, _ := erc["bridge_cost_pct"].(float64)
	if costPct == 0 {
		return nil
	}
	amount, _ := event["amount"].(float64)
	chainFrom := safeStr(event, "chain_from")
	if chainFrom == "" {
		chainFrom = safeStr(event, "chain")
	}
	chainTo := safeStr(event, "chain_to")

	return &BridgeInfo{
		BridgeCostPct: costPct,
		BridgeCostAbs: amount * costPct / 100.0,
		Protocol:      safeStr(event, "instrument_type"),
		ChainFrom:     chainFrom,
		ChainTo:       chainTo,
	}
}

func (e *Engine) persistAction(action *Action, event map[string]interface{}) {
	args := map[string]interface{}{
		"action_type":      action.ActionType,
		"severity":         string(action.Severity),
		"trigger_rule":     action.TriggerRule,
		"trigger_event_id": safeStr(event, "id"),
		"evidence":         action.Evidence,
		"action_detail":    action.ActionDetail,
		"agent_id":         action.AgentID,
		"domain":           action.Domain,
		"fleet_id":         action.FleetID,
	}
	if _, err := e.convex.Mutation("intelligence:insertAction", args); err != nil {
		log.Printf("engine: failed to persist action %s: %v", action.TriggerRule, err)
	}
}

func (e *Engine) applyAutoAction(action *Action) {
	switch action.TriggerRule {
	case "VH-1":
		args := map[string]interface{}{
			"domain": action.Domain,
			"reason": action.ActionDetail,
		}
		if _, err := e.convex.Mutation("vendors:blockVendor", args); err != nil {
			log.Printf("engine: VH-1 failed to block %s: %v", action.Domain, err)
		}
	}
}

// safeStr extracts a string from a map, returning "" if missing or wrong type.
func safeStr(m map[string]interface{}, key string) string {
	v, _ := m[key].(string)
	return v
}

// safeFloat extracts a float64 from a map, returning 0 if missing or wrong type.
func safeFloat(m map[string]interface{}, key string) float64 {
	v, _ := m[key].(float64)
	return v
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/server && go build ./internal/engine/...
```

Expected: builds without errors. (Rules referenced in `New()` don't exist yet — expect "undefined" errors. That's fine; fix by adding stub files for each rule.)

Actually at this step the build will fail because VH1BlockVendor etc. don't exist yet. To unblock compilation, create a temporary `apps/server/internal/engine/rules_stub.go`:

```go
package engine

type VH1BlockVendor struct{}
func (r *VH1BlockVendor) ID() string { return "VH-1" }
func (r *VH1BlockVendor) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action { return nil }

type VH2SlowVendor struct{}
func (r *VH2SlowVendor) ID() string { return "VH-2" }
func (r *VH2SlowVendor) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action { return nil }

type SA1AgentAnomaly struct{}
func (r *SA1AgentAnomaly) ID() string { return "SA-1" }
func (r *SA1AgentAnomaly) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action { return nil }

type SA2UnusualPayment struct{}
func (r *SA2UnusualPayment) ID() string { return "SA-2" }
func (r *SA2UnusualPayment) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action { return nil }

type SA3FleetSpike struct{}
func (r *SA3FleetSpike) ID() string { return "SA-3" }
func (r *SA3FleetSpike) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action { return nil }

type RO1BridgeWarning struct{}
func (r *RO1BridgeWarning) ID() string { return "RO-1" }
func (r *RO1BridgeWarning) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action { return nil }
```

Run `go build ./internal/engine/...` — should now compile.

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/engine/engine.go apps/server/internal/engine/rules_stub.go
git commit -m "feat(engine): add Engine orchestrator with buildContext, Evaluate, persist, dedup"
```

---

## Task 8: VH-1 Auto-Block Unhealthy Vendor

**Files:**
- Create: `apps/server/internal/engine/vh1_block_vendor.go`
- Create: `apps/server/internal/engine/vh1_block_vendor_test.go`

- [ ] **Step 1: Write the failing test**

Create `apps/server/internal/engine/vh1_block_vendor_test.go`:

```go
package engine

import "testing"

func TestVH1BlockVendor(t *testing.T) {
	rule := &VH1BlockVendor{}
	event := map[string]interface{}{"id": "evt_test", "agent_id": "agent-1", "fleet_id": "fleet-1"}

	tests := []struct {
		name     string
		vendor   *VendorStats
		wantAct  bool
		wantSev  Severity
	}{
		{
			name:    "fires: below threshold, min sample met, streak met",
			vendor:  &VendorStats{Domain: "bad.com", SuccessRate: 0.40, EventCount: 15, FailureStreak: 3},
			wantAct: true,
			wantSev: SeverityAutoAct,
		},
		{
			name:    "no action: success_rate exactly at threshold",
			vendor:  &VendorStats{Domain: "ok.com", SuccessRate: 0.50, EventCount: 15, FailureStreak: 3},
			wantAct: false,
		},
		{
			name:    "no action: above threshold",
			vendor:  &VendorStats{Domain: "good.com", SuccessRate: 0.95, EventCount: 20, FailureStreak: 0},
			wantAct: false,
		},
		{
			name:    "no action: below min sample (< 10)",
			vendor:  &VendorStats{Domain: "new.com", SuccessRate: 0.20, EventCount: 5, FailureStreak: 3},
			wantAct: false,
		},
		{
			name:    "no action: streak too short (< 3)",
			vendor:  &VendorStats{Domain: "flaky.com", SuccessRate: 0.40, EventCount: 15, FailureStreak: 2},
			wantAct: false,
		},
		{
			name:    "no action: already blocked",
			vendor:  &VendorStats{Domain: "blocked.com", SuccessRate: 0.20, EventCount: 20, FailureStreak: 5, IsBlocked: true},
			wantAct: false,
		},
		{
			name:    "no action: nil vendor (no domain)",
			vendor:  nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{Vendor: tt.vendor}
			action := rule.Evaluate(event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil && action.Severity != tt.wantSev {
				t.Errorf("got severity=%s, want %s", action.Severity, tt.wantSev)
			}
			if action != nil && action.TriggerRule != "VH-1" {
				t.Errorf("got rule=%s, want VH-1", action.TriggerRule)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && go test ./internal/engine/... -run TestVH1 -v
```

Expected: FAIL — stub VH1BlockVendor.Evaluate always returns nil

- [ ] **Step 3: Create vh1_block_vendor.go (replace stub)**

Remove `VH1BlockVendor` from `rules_stub.go` (delete those 4 lines), then create:

```go
package engine

import "fmt"

// VH1BlockVendor auto-blocks a vendor whose sliding-window success rate drops
// below 50% with at least 10 events and 3 consecutive failures.
type VH1BlockVendor struct{}

func (r *VH1BlockVendor) ID() string { return "VH-1" }

func (r *VH1BlockVendor) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Vendor == nil || ctx.Vendor.IsBlocked {
		return nil
	}
	v := ctx.Vendor
	if v.SuccessRate >= 0.50 || v.EventCount < 10 || v.FailureStreak < 3 {
		return nil
	}
	return &Action{
		ActionType:  "auto_block",
		Severity:    SeverityAutoAct,
		TriggerRule: "VH-1",
		Domain:      v.Domain,
		AgentID:     safeStr(event, "agent_id"),
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"auto-blocked %s: success_rate %.0f%% < 50%% with %d consecutive failures",
			v.Domain, v.SuccessRate*100, v.FailureStreak,
		),
		Evidence: map[string]interface{}{
			"domain":           v.Domain,
			"success_rate":     v.SuccessRate,
			"event_count":      v.EventCount,
			"failure_streak":   v.FailureStreak,
			"last_10_outcomes": v.Last10Outcomes,
		},
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/server && go test ./internal/engine/... -run TestVH1 -v
```

Expected: all 7 cases PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/internal/engine/vh1_block_vendor.go apps/server/internal/engine/vh1_block_vendor_test.go apps/server/internal/engine/rules_stub.go
git commit -m "feat(engine): implement VH-1 auto-block unhealthy vendor rule"
```

---

## Task 9: VH-2 Flag Slow Vendor

**Files:**
- Create: `apps/server/internal/engine/vh2_slow_vendor.go`
- Create: `apps/server/internal/engine/vh2_slow_vendor_test.go`

- [ ] **Step 1: Write the failing test**

```go
package engine

import "testing"

func TestVH2SlowVendor(t *testing.T) {
	rule := &VH2SlowVendor{}
	event := map[string]interface{}{"id": "evt_test", "agent_id": "agent-1", "fleet_id": "fleet-1"}

	tests := []struct {
		name    string
		vendor  *VendorStats
		wantAct bool
	}{
		{
			name:    "fires: avg latency above 5000ms, min sample met",
			vendor:  &VendorStats{Domain: "slow.com", AvgLatencyMs: 6000, EventCount: 10},
			wantAct: true,
		},
		{
			name:    "no action: latency exactly at threshold",
			vendor:  &VendorStats{Domain: "ok.com", AvgLatencyMs: 5000, EventCount: 10},
			wantAct: false,
		},
		{
			name:    "no action: fast vendor",
			vendor:  &VendorStats{Domain: "fast.com", AvgLatencyMs: 200, EventCount: 20},
			wantAct: false,
		},
		{
			name:    "no action: slow but below min sample (< 5)",
			vendor:  &VendorStats{Domain: "new.com", AvgLatencyMs: 8000, EventCount: 3},
			wantAct: false,
		},
		{
			name:    "no action: nil vendor",
			vendor:  nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{Vendor: tt.vendor}
			action := rule.Evaluate(event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil {
				if action.Severity != SeverityFlag {
					t.Errorf("expected FLAG severity, got %s", action.Severity)
				}
				if action.TriggerRule != "VH-2" {
					t.Errorf("expected VH-2, got %s", action.TriggerRule)
				}
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && go test ./internal/engine/... -run TestVH2 -v
```

Expected: FAIL — stub returns nil

- [ ] **Step 3: Create vh2_slow_vendor.go (remove VH2SlowVendor from rules_stub.go)**

```go
package engine

import "fmt"

// VH2SlowVendor flags a vendor whose average latency exceeds 5000ms
// with at least 5 events in the window.
type VH2SlowVendor struct{}

func (r *VH2SlowVendor) ID() string { return "VH-2" }

func (r *VH2SlowVendor) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Vendor == nil {
		return nil
	}
	v := ctx.Vendor
	if v.AvgLatencyMs <= 5000 || v.EventCount < 5 {
		return nil
	}
	return &Action{
		ActionType:  "auto_flag",
		Severity:    SeverityFlag,
		TriggerRule: "VH-2",
		Domain:      v.Domain,
		AgentID:     safeStr(event, "agent_id"),
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"slow vendor %s: avg latency %.0fms > 5000ms threshold",
			v.Domain, v.AvgLatencyMs,
		),
		Evidence: map[string]interface{}{
			"domain":         v.Domain,
			"avg_latency_ms": v.AvgLatencyMs,
			"event_count":    v.EventCount,
		},
	}
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/server && go test ./internal/engine/... -run TestVH2 -v
```

Expected: all 5 cases PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/internal/engine/vh2_slow_vendor.go apps/server/internal/engine/vh2_slow_vendor_test.go apps/server/internal/engine/rules_stub.go
git commit -m "feat(engine): implement VH-2 flag slow vendor rule"
```

---

## Task 10: SA-1 Agent Spend Anomaly

**Files:**
- Create: `apps/server/internal/engine/sa1_agent_anomaly.go`
- Create: `apps/server/internal/engine/sa1_agent_anomaly_test.go`

- [ ] **Step 1: Write the failing test**

```go
package engine

import "testing"

func TestSA1AgentAnomaly(t *testing.T) {
	rule := &SA1AgentAnomaly{}
	event := map[string]interface{}{"id": "evt_test", "fleet_id": "fleet-1"}

	tests := []struct {
		name    string
		agent   *AgentAggregates
		wantAct bool
	}{
		{
			name:    "fires: daily spend > 2x avg, baseline > $10, active days >= 3",
			agent:   &AgentAggregates{AgentID: "agent-1", DailySpend: 280, AvgDaily7d: 120, ActiveDays: 7, TotalEvents: 50},
			wantAct: true,
		},
		{
			name:    "no action: spend exactly at 2x (not above)",
			agent:   &AgentAggregates{AgentID: "agent-1", DailySpend: 240, AvgDaily7d: 120, ActiveDays: 7, TotalEvents: 50},
			wantAct: false,
		},
		{
			name:    "no action: baseline too low (< $10)",
			agent:   &AgentAggregates{AgentID: "agent-1", DailySpend: 30, AvgDaily7d: 5, ActiveDays: 7, TotalEvents: 50},
			wantAct: false,
		},
		{
			name:    "no action: not enough history (< 3 active days)",
			agent:   &AgentAggregates{AgentID: "agent-1", DailySpend: 280, AvgDaily7d: 120, ActiveDays: 2, TotalEvents: 50},
			wantAct: false,
		},
		{
			name:    "no action: nil agent",
			agent:   nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{Agent: tt.agent}
			action := rule.Evaluate(event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil {
				if action.Severity != SeverityAlert {
					t.Errorf("expected ALERT severity, got %s", action.Severity)
				}
				if action.TriggerRule != "SA-1" {
					t.Errorf("expected SA-1, got %s", action.TriggerRule)
				}
				if action.AgentID == "" {
					t.Error("expected AgentID to be set")
				}
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && go test ./internal/engine/... -run TestSA1 -v
```

Expected: FAIL

- [ ] **Step 3: Create sa1_agent_anomaly.go (remove SA1AgentAnomaly from rules_stub.go)**

```go
package engine

import "fmt"

// SA1AgentAnomaly alerts when an agent's daily spend exceeds 2x its 7-day average.
// Guards: baseline >= $10 and at least 3 active days prevent false positives on new/low-volume agents.
type SA1AgentAnomaly struct{}

func (r *SA1AgentAnomaly) ID() string { return "SA-1" }

func (r *SA1AgentAnomaly) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Agent == nil {
		return nil
	}
	a := ctx.Agent
	if a.AvgDaily7d < 10.0 || a.ActiveDays < 3 {
		return nil
	}
	if a.DailySpend <= 2.0*a.AvgDaily7d {
		return nil
	}
	pctOver := (a.DailySpend/a.AvgDaily7d - 1) * 100
	return &Action{
		ActionType:  "auto_alert",
		Severity:    SeverityAlert,
		TriggerRule: "SA-1",
		AgentID:     a.AgentID,
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"agent %s spend anomaly: $%.2f today vs $%.2f 7d avg (%.0f%% over)",
			a.AgentID, a.DailySpend, a.AvgDaily7d, pctOver,
		),
		Evidence: map[string]interface{}{
			"agent_id":            a.AgentID,
			"daily_spend":         a.DailySpend,
			"avg_daily_7d":        a.AvgDaily7d,
			"pct_over":            fmt.Sprintf("%.0f%%", pctOver),
			"triggering_event_id": safeStr(event, "id"),
		},
	}
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/server && go test ./internal/engine/... -run TestSA1 -v
```

Expected: all 5 cases PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/internal/engine/sa1_agent_anomaly.go apps/server/internal/engine/sa1_agent_anomaly_test.go apps/server/internal/engine/rules_stub.go
git commit -m "feat(engine): implement SA-1 agent spend anomaly rule"
```

---

## Task 11: SA-2 Unusual Single Payment

**Files:**
- Create: `apps/server/internal/engine/sa2_unusual_payment.go`
- Create: `apps/server/internal/engine/sa2_unusual_payment_test.go`

- [ ] **Step 1: Write the failing test**

```go
package engine

import "testing"

func TestSA2UnusualPayment(t *testing.T) {
	rule := &SA2UnusualPayment{}
	baseAgent := &AgentAggregates{AgentID: "agent-1", AvgTxAmount: 5.0, TotalEvents: 20}

	tests := []struct {
		name       string
		event      map[string]interface{}
		agent      *AgentAggregates
		edgeCount  int64
		edgeAvgPmt float64
		wantAct    bool
	}{
		{
			name:    "fires: amount > 5x avg, above min absolute, enough history",
			event:   map[string]interface{}{"id": "evt_1", "amount": 30.0, "domain": "api.com", "standard": "x402", "fleet_id": "f1"},
			agent:   baseAgent,
			wantAct: true,
		},
		{
			name:    "no action: amount <= 5x avg",
			event:   map[string]interface{}{"id": "evt_2", "amount": 25.0, "domain": "api.com", "standard": "x402", "fleet_id": "f1"},
			agent:   baseAgent,
			wantAct: false,
		},
		{
			name:    "no action: below min absolute ($5)",
			event:   map[string]interface{}{"id": "evt_3", "amount": 0.30, "domain": "api.com", "standard": "x402", "fleet_id": "f1"},
			agent:   &AgentAggregates{AgentID: "agent-1", AvgTxAmount: 0.05, TotalEvents: 20},
			wantAct: false,
		},
		{
			name:    "no action: not enough history (< 10 events)",
			event:   map[string]interface{}{"id": "evt_4", "amount": 30.0, "domain": "api.com", "standard": "x402", "fleet_id": "f1"},
			agent:   &AgentAggregates{AgentID: "agent-1", AvgTxAmount: 5.0, TotalEvents: 5},
			wantAct: false,
		},
		{
			name:       "no action: amount high globally but normal for this vendor (5+ edge events)",
			event:      map[string]interface{}{"id": "evt_5", "amount": 30.0, "domain": "expensive.com", "standard": "x402", "fleet_id": "f1"},
			agent:      baseAgent,
			edgeCount:  10,
			edgeAvgPmt: 12.0, // 30 <= 3*12=36, so vendor-normal
			wantAct:    false,
		},
		{
			name:    "no action: nil agent",
			event:   map[string]interface{}{"id": "evt_6", "amount": 100.0, "domain": "api.com", "fleet_id": "f1"},
			agent:   nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{
				Agent:      tt.agent,
				EdgeCount:  tt.edgeCount,
				EdgeAvgPmt: tt.edgeAvgPmt,
			}
			action := rule.Evaluate(tt.event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil {
				if action.Severity != SeverityFlag {
					t.Errorf("expected FLAG, got %s", action.Severity)
				}
				if action.TriggerRule != "SA-2" {
					t.Errorf("expected SA-2, got %s", action.TriggerRule)
				}
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && go test ./internal/engine/... -run TestSA2 -v
```

Expected: FAIL

- [ ] **Step 3: Create sa2_unusual_payment.go (remove SA2UnusualPayment from rules_stub.go)**

```go
package engine

import "fmt"

// SA2UnusualPayment flags a single payment that is unusually large.
// Guards: min absolute amount, min event history, and vendor-specific context.
type SA2UnusualPayment struct{}

func (r *SA2UnusualPayment) ID() string { return "SA-2" }

func (r *SA2UnusualPayment) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Agent == nil {
		return nil
	}
	a := ctx.Agent
	amount := safeFloat(event, "amount")

	if amount <= 5.0 || a.TotalEvents < 10 {
		return nil
	}
	if amount <= 5.0*a.AvgTxAmount {
		return nil
	}
	// If we have vendor-specific history (5+ payments), check vendor-normal range
	if ctx.EdgeCount >= 5 && ctx.EdgeAvgPmt > 0 && amount <= 3.0*ctx.EdgeAvgPmt {
		return nil
	}

	domain := safeStr(event, "domain")
	evidence := map[string]interface{}{
		"event_id":     safeStr(event, "id"),
		"amount":       amount,
		"agent_avg_tx": a.AvgTxAmount,
		"domain":       domain,
		"standard":     safeStr(event, "standard"),
	}
	if ctx.EdgeCount >= 5 {
		evidence["vendor_avg_for_agent"] = ctx.EdgeAvgPmt
		evidence["vendor_event_count"] = ctx.EdgeCount
	}

	return &Action{
		ActionType:  "auto_flag",
		Severity:    SeverityFlag,
		TriggerRule: "SA-2",
		AgentID:     a.AgentID,
		Domain:      domain,
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"unusual payment $%.2f by agent %s (%.0fx agent avg $%.2f)",
			amount, a.AgentID, amount/a.AvgTxAmount, a.AvgTxAmount,
		),
		Evidence: evidence,
	}
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/server && go test ./internal/engine/... -run TestSA2 -v
```

Expected: all 6 cases PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/internal/engine/sa2_unusual_payment.go apps/server/internal/engine/sa2_unusual_payment_test.go apps/server/internal/engine/rules_stub.go
git commit -m "feat(engine): implement SA-2 unusual single payment rule"
```

---

## Task 12: SA-3 Fleet Spend Spike

**Files:**
- Create: `apps/server/internal/engine/sa3_fleet_spike.go`
- Create: `apps/server/internal/engine/sa3_fleet_spike_test.go`

- [ ] **Step 1: Write the failing test**

```go
package engine

import "testing"

func TestSA3FleetSpike(t *testing.T) {
	rule := &SA3FleetSpike{}
	event := map[string]interface{}{"id": "evt_test", "agent_id": "agent-1"}

	tests := []struct {
		name    string
		fleet   *FleetAggregates
		wantAct bool
	}{
		{
			name:    "fires: hourly spend > 3x avg, baseline > $50",
			fleet:   &FleetAggregates{FleetID: "fleet-1", HourlySpend: 600, AvgHourly7d: 150},
			wantAct: true,
		},
		{
			name:    "no action: spend exactly at 3x",
			fleet:   &FleetAggregates{FleetID: "fleet-1", HourlySpend: 450, AvgHourly7d: 150},
			wantAct: false,
		},
		{
			name:    "no action: baseline too low (< $50)",
			fleet:   &FleetAggregates{FleetID: "fleet-1", HourlySpend: 300, AvgHourly7d: 30},
			wantAct: false,
		},
		{
			name:    "no action: baseline is zero (new fleet)",
			fleet:   &FleetAggregates{FleetID: "fleet-1", HourlySpend: 500, AvgHourly7d: 0},
			wantAct: false,
		},
		{
			name:    "no action: nil fleet",
			fleet:   nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{Fleet: tt.fleet}
			action := rule.Evaluate(event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil {
				if action.Severity != SeverityAlert {
					t.Errorf("expected ALERT, got %s", action.Severity)
				}
				if action.TriggerRule != "SA-3" {
					t.Errorf("expected SA-3, got %s", action.TriggerRule)
				}
				if action.FleetID == "" {
					t.Error("expected FleetID to be set")
				}
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && go test ./internal/engine/... -run TestSA3 -v
```

Expected: FAIL

- [ ] **Step 3: Create sa3_fleet_spike.go (remove SA3FleetSpike from rules_stub.go)**

```go
package engine

import "fmt"

// SA3FleetSpike alerts when a fleet's hourly spend exceeds 3x its 7-day hourly average.
// Guard: baseline >= $50 prevents noise on new or low-volume fleets.
type SA3FleetSpike struct{}

func (r *SA3FleetSpike) ID() string { return "SA-3" }

func (r *SA3FleetSpike) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Fleet == nil {
		return nil
	}
	f := ctx.Fleet
	if f.AvgHourly7d < 50.0 || f.HourlySpend <= 3.0*f.AvgHourly7d {
		return nil
	}
	multiplier := f.HourlySpend / f.AvgHourly7d
	return &Action{
		ActionType:  "auto_alert",
		Severity:    SeverityAlert,
		TriggerRule: "SA-3",
		FleetID:     f.FleetID,
		AgentID:     safeStr(event, "agent_id"),
		ActionDetail: fmt.Sprintf(
			"fleet %s spend spike: $%.2f/hr vs $%.2f 7d avg (%.1fx)",
			f.FleetID, f.HourlySpend, f.AvgHourly7d, multiplier,
		),
		Evidence: map[string]interface{}{
			"fleet_id":      f.FleetID,
			"hourly_spend":  f.HourlySpend,
			"avg_hourly_7d": f.AvgHourly7d,
			"multiplier":    fmt.Sprintf("%.1fx", multiplier),
		},
	}
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/server && go test ./internal/engine/... -run TestSA3 -v
```

Expected: all 5 cases PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/internal/engine/sa3_fleet_spike.go apps/server/internal/engine/sa3_fleet_spike_test.go apps/server/internal/engine/rules_stub.go
git commit -m "feat(engine): implement SA-3 fleet spend spike rule"
```

---

## Task 13: RO-1 Expensive Bridge Warning

**Files:**
- Create: `apps/server/internal/engine/ro1_bridge_warning.go`
- Create: `apps/server/internal/engine/ro1_bridge_warning_test.go`

- [ ] **Step 1: Write the failing test**

```go
package engine

import "testing"

func TestRO1BridgeWarning(t *testing.T) {
	rule := &RO1BridgeWarning{}

	tests := []struct {
		name    string
		event   map[string]interface{}
		bridge  *BridgeInfo
		wantAct bool
	}{
		{
			name:  "fires: pct > 20 and abs > $1",
			event: map[string]interface{}{"id": "evt_1", "agent_id": "agent-1", "fleet_id": "fleet-1", "amount": 10.0},
			bridge: &BridgeInfo{
				BridgeCostPct: 30.0, BridgeCostAbs: 3.0,
				Protocol: "cctp", ChainFrom: "ethereum", ChainTo: "solana",
			},
			wantAct: true,
		},
		{
			name:  "no action: pct > 20 but abs <= $1 (trivial fee)",
			event: map[string]interface{}{"id": "evt_2", "agent_id": "agent-1", "fleet_id": "fleet-1", "amount": 3.0},
			bridge: &BridgeInfo{
				BridgeCostPct: 33.0, BridgeCostAbs: 0.99,
				Protocol: "cctp", ChainFrom: "ethereum", ChainTo: "solana",
			},
			wantAct: false,
		},
		{
			name:  "no action: abs > $1 but pct <= 20",
			event: map[string]interface{}{"id": "evt_3", "agent_id": "agent-1", "fleet_id": "fleet-1", "amount": 100.0},
			bridge: &BridgeInfo{
				BridgeCostPct: 15.0, BridgeCostAbs: 15.0,
				Protocol: "cctp", ChainFrom: "ethereum", ChainTo: "solana",
			},
			wantAct: false,
		},
		{
			name:    "no action: nil bridge (no bridge used)",
			event:   map[string]interface{}{"id": "evt_4", "agent_id": "agent-1", "fleet_id": "fleet-1", "amount": 5.0},
			bridge:  nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{Bridge: tt.bridge}
			action := rule.Evaluate(tt.event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil {
				if action.Severity != SeverityAlert {
					t.Errorf("expected ALERT, got %s", action.Severity)
				}
				if action.TriggerRule != "RO-1" {
					t.Errorf("expected RO-1, got %s", action.TriggerRule)
				}
				if action.Evidence["chain_from"] == "" {
					t.Error("expected chain_from in evidence")
				}
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && go test ./internal/engine/... -run TestRO1 -v
```

Expected: FAIL

- [ ] **Step 3: Create ro1_bridge_warning.go (remove RO1BridgeWarning from rules_stub.go)**

```go
package engine

import "fmt"

// RO1BridgeWarning alerts when a bridge fee exceeds both 20% of the payment
// and $1 in absolute terms, filtering out trivial fees.
type RO1BridgeWarning struct{}

func (r *RO1BridgeWarning) ID() string { return "RO-1" }

func (r *RO1BridgeWarning) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Bridge == nil {
		return nil
	}
	b := ctx.Bridge
	if b.BridgeCostPct <= 20.0 || b.BridgeCostAbs <= 1.0 {
		return nil
	}
	amount := safeFloat(event, "amount")
	return &Action{
		ActionType:  "auto_alert",
		Severity:    SeverityAlert,
		TriggerRule: "RO-1",
		AgentID:     safeStr(event, "agent_id"),
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"expensive bridge: %.0f%% fee ($%.2f) on $%.2f payment %s→%s",
			b.BridgeCostPct, b.BridgeCostAbs, amount, b.ChainFrom, b.ChainTo,
		),
		Evidence: map[string]interface{}{
			"event_id":        safeStr(event, "id"),
			"bridge_cost":     b.BridgeCostAbs,
			"payment_amount":  amount,
			"bridge_cost_pct": b.BridgeCostPct,
			"chain_from":      b.ChainFrom,
			"chain_to":        b.ChainTo,
			"protocol":        b.Protocol,
			"suggestion":      fmt.Sprintf("Rebalance funds to %s to avoid bridge fees", b.ChainTo),
		},
	}
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/server && go test ./internal/engine/... -run TestRO1 -v
```

Expected: all 4 cases PASS

- [ ] **Step 5: Delete rules_stub.go** — all stubs have been replaced by real implementations

```bash
rm apps/server/internal/engine/rules_stub.go
cd apps/server && go build ./internal/engine/...
```

Expected: builds cleanly without the stub file.

- [ ] **Step 6: Run all engine tests**

```bash
cd apps/server && go test ./internal/engine/... -v
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/internal/engine/ro1_bridge_warning.go apps/server/internal/engine/ro1_bridge_warning_test.go
git rm apps/server/internal/engine/rules_stub.go
git commit -m "feat(engine): implement RO-1 expensive bridge warning rule, remove stubs"
```

---

## Task 14: Wire Engine into Ingest Pipeline

**Files:**
- Modify: `apps/server/internal/handler/ingest.go`
- Modify: `apps/server/internal/router/router.go`

- [ ] **Step 1: Update ingest.go**

Replace the full contents of `apps/server/internal/handler/ingest.go`:

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rhemify/server/internal/anchor"
	cx "github.com/rhemify/server/internal/convex"
	"github.com/rhemify/server/internal/engine"
)

type IngestHandler struct {
	convex  *cx.Client
	batcher *anchor.BatchManager
	engine  *engine.Engine
}

func NewIngestHandler(convex *cx.Client, batcher *anchor.BatchManager, eng *engine.Engine) *IngestHandler {
	return &IngestHandler{convex: convex, batcher: batcher, engine: eng}
}

type IngestPayload struct {
	Event           map[string]interface{}   `json:"event" binding:"required"`
	Trace           map[string]interface{}   `json:"trace" binding:"required"`
	PolicyDecisions []map[string]interface{} `json:"policyDecisions" binding:"required"`
}

// POST /api/ingest/payment — ingest a payment event + trace + policy decisions
func (h *IngestHandler) IngestPayment(c *gin.Context) {
	var payload IngestPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Insert payment event
	eventResult, err := h.convex.Mutation("events:insert", payload.Event)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to insert event: " + err.Error()})
		return
	}
	var eventID string
	if err := json.Unmarshal(eventResult, &eventID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse event ID: " + err.Error()})
		return
	}

	// 2. Insert payment trace
	if _, err = h.convex.Mutation("traces:insert", payload.Trace); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to insert trace: " + err.Error()})
		return
	}

	// 3. Insert policy decisions (best-effort, pass eventID to avoid cross-linking)
	for _, decision := range payload.PolicyDecisions {
		decision["payment_event_id"] = eventID
		h.convex.Mutation("policies:insertDecision", decision)
	}

	// 4. Update derived data (best-effort — errors logged inside Convex, don't block ingest)
	h.convex.Mutation("vendors:updateStats", map[string]interface{}{
		"domain":   payload.Event["domain"],
		"outcome":  payload.Event["outcome"],
		"standard": payload.Event["standard"],
	})
	h.convex.Mutation("aggregates:updateAgent", map[string]interface{}{
		"agent_id": payload.Event["agent_id"],
		"fleet_id": payload.Event["fleet_id"],
		"amount":   payload.Event["amount"],
		"outcome":  payload.Event["outcome"],
	})
	h.convex.Mutation("aggregates:updateFleet", map[string]interface{}{
		"fleet_id": payload.Event["fleet_id"],
		"amount":   payload.Event["amount"],
		"outcome":  payload.Event["outcome"],
	})
	h.convex.Mutation("aggregates:upsertEdge", map[string]interface{}{
		"agent_id": payload.Event["agent_id"],
		"domain":   payload.Event["domain"],
		"amount":   payload.Event["amount"],
		"outcome":  payload.Event["outcome"],
	})

	// 5. Run intelligence rules engine (best-effort — errors logged inside engine)
	h.engine.Evaluate(payload.Event, payload.Trace)

	// 6. Trigger Merkle batching
	fleetID, _ := payload.Event["fleet_id"].(string)
	traceHash, _ := payload.Trace["trace_hash"].(string)
	if fleetID != "" && traceHash != "" {
		h.batcher.OnTraceIngested(fleetID, traceHash)
	}

	c.JSON(http.StatusOK, gin.H{
		"eventId": eventID,
		"traceId": payload.Trace["id"],
	})
}
```

- [ ] **Step 2: Update router.go to create and inject the engine**

In `apps/server/internal/router/router.go`, add the engine import and creation:

```go
package router

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/rhemify/server/internal/anchor"
	"github.com/rhemify/server/internal/config"
	cx "github.com/rhemify/server/internal/convex"
	"github.com/rhemify/server/internal/engine"
	"github.com/rhemify/server/internal/handler"
	"github.com/rhemify/server/internal/middleware"
)

func Setup(convex *cx.Client, cfg *config.Config) *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CORSOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	batcher := anchor.NewBatchManager(convex)
	eng := engine.New(convex)

	health := handler.NewHealthHandler(convex)
	fleet := handler.NewFleetHandler(convex)
	events := handler.NewEventsHandler(convex)
	traces := handler.NewTracesHandler(convex)
	ingest := handler.NewIngestHandler(convex, batcher, eng)
	policy := handler.NewPolicyHandler(convex)
	anchorHandler := handler.NewAnchorHandler(convex)
	vendor := handler.NewVendorHandler(convex)

	api := r.Group("/api")
	{
		api.GET("/health", health.Check)

		api.GET("/fleet/stats", fleet.GetStats)
		api.GET("/fleet/agents", fleet.ListAgents)
		api.GET("/fleet/agents/:id", fleet.GetAgent)
		api.GET("/events", events.ListEvents)
		api.GET("/events/:id", events.GetEvent)
		api.GET("/traces/:id", traces.GetTrace)

		sdk := api.Group("")
		sdk.Use(middleware.FleetAPIKeyAuth())
		{
			sdk.POST("/ingest/payment", ingest.IngestPayment)
			sdk.GET("/policy/:agentId", policy.GetPolicy)
			sdk.POST("/policy/:agentId", policy.SetPolicy)
			sdk.GET("/vendor/:domain", vendor.GetVendorStatus)
			sdk.GET("/fleet/status", fleet.GetStats)
			sdk.PATCH("/traces/:id/anchor", anchorHandler.UpdateTraceAnchor)
			sdk.GET("/anchor/verify/:traceId", anchorHandler.VerifyTrace)
			sdk.GET("/anchor/:fleetId/:date", anchorHandler.GetDailyRoot)
		}
	}

	return r
}
```

- [ ] **Step 3: Build the full server**

```bash
cd apps/server && go build ./...
```

Expected: compiles with no errors.

- [ ] **Step 4: Run all engine tests**

```bash
cd apps/server && go test ./internal/engine/... -v
```

Expected: all tests PASS

- [ ] **Step 5: Smoke test the server locally**

Start the Convex dev server in one terminal:
```bash
bunx convex dev
```

Start the Go server in another:
```bash
cd apps/server && go run ./cmd/server
```

Send a test ingest request:
```bash
curl -s -X POST http://localhost:8080/api/ingest/payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{
    "event": {
      "id": "evt_smoke_001",
      "agent_id": "agent-smoke",
      "fleet_id": "fleet-smoke",
      "standard": "x402",
      "amount": 1.50,
      "token": "USDC",
      "chain": "solana",
      "domain": "api.test.com",
      "outcome": "success",
      "instrument_type": "ows",
      "trace_id": "trc_smoke_001"
    },
    "trace": {
      "id": "trc_smoke_001",
      "trace_id": "trc_smoke_001",
      "agent_task_context": "smoke test",
      "trigger_402_raw": "{}",
      "alternatives_evaluated": [],
      "policy_rules_fired": [],
      "instrument_selection_log": {},
      "confidence": "high",
      "replay_snapshot": {},
      "trace_hash": "abc123smoke"
    },
    "policyDecisions": []
  }'
```

Expected response: `{"eventId": "...", "traceId": "trc_smoke_001"}`

Check Convex dashboard: `agent_aggregates` and `fleet_aggregates` should have a new record for `agent-smoke` / `fleet-smoke`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/internal/handler/ingest.go apps/server/internal/router/router.go
git commit -m "feat(ingest): wire rules engine into ingest pipeline with aggregate updates"
```

---

## Self-Review

**Spec coverage check:**

| Spec Section | Tasks |
|---|---|
| Engine package structure (Approach B) | Tasks 5–7 |
| EvalContext — all 4 sub-structs | Task 5 |
| Materialized aggregate tables (agent + fleet) | Tasks 1, 2 |
| EMA updates on ingest | Task 2 (aggregates.ts) |
| Payment edge upsert | Task 2 (upsertEdge) |
| Vendor stats update on ingest | Task 3 (updateStats) |
| Vendor sliding window query | Task 3 (getStatsForEngine) |
| VH-1 with cooldown + escalation | Tasks 3 (blockVendor + processAutoUnblocks), 8 |
| VH-2 with min sample | Task 9 |
| SA-1 with baseline + active days guards | Task 10 |
| SA-2 with vendor context | Task 11 |
| SA-3 with baseline guard | Task 12 |
| RO-1 with dual threshold (pct + abs) | Task 13 |
| Alert deduplication | Task 6, engine.go shouldDedup |
| intelligence_actions persistence | Tasks 1, 4, engine.go persistAction |
| AUTO-ACT application (VH-1 block) | Task 7 engine.go applyAutoAction |
| Ingest pipeline update | Task 14 |
| Cron for auto-unblock | Task 3 (crons.ts) |

All spec sections covered. ✓
