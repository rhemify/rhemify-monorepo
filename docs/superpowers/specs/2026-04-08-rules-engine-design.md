# Rules Engine Design — RHE-23

**Date:** 2026-04-08
**Author:** Soh Zhe Hong
**Status:** Approved
**Issue:** [RHE-23](https://linear.app/rhemify/issue/RHE-23/build-rules-engine-vendor-health-spend-anomaly-route-optimization)

---

## Scope

Deterministic rules engine for the Rhemos intelligence layer. Evaluates 6 rules on every ingested payment event. Records all actions in `intelligence_actions`. Designed for production use — handles edge cases, noise, and 24/7 unattended operation.

Rules in scope (hackathon milestone):
- VH-1: Auto-Block Unhealthy Vendor
- VH-2: Flag Slow Vendor
- SA-1: Agent Spend Anomaly
- SA-2: Unusual Single Payment
- SA-3: Fleet Spend Spike
- RO-1: Expensive Bridge Warning

Out of scope: VH-3, RO-2/3, PE-1/2/3, TO-1/2, configuration API (hardcoded defaults for now).

---

## Architecture

### Package Structure

New package `internal/engine/` in the Go server. Ingest handler calls `engine.Evaluate(event)` after storing event + trace + decisions.

```
apps/server/internal/engine/
├── engine.go              # Orchestrator
├── rule.go                # Rule interface + Action/Severity types
├── context.go             # EvalContext — aggregates fetched once per evaluation
├── dedup.go               # Alert deduplication (in-memory, per fleet+rule+day)
├── vh1_block_vendor.go
├── vh2_slow_vendor.go
├── sa1_agent_anomaly.go
├── sa2_unusual_payment.go
├── sa3_fleet_spike.go
└── ro1_bridge_warning.go
```

### Rule Interface

```go
// rule.go
type Severity string
const (
    SeverityLog     Severity = "LOG"
    SeverityFlag    Severity = "FLAG"
    SeverityAlert   Severity = "ALERT"
    SeverityAutoAct Severity = "AUTO_ACT"
)

type Action struct {
    ActionType   string                 // "auto_block" | "auto_flag" | "auto_alert"
    Severity     Severity
    TriggerRule  string                 // "VH-1", "SA-1", etc.
    Evidence     map[string]interface{}
    ActionDetail string                 // human-readable summary
    Domain       string                 // for vendor rules
    AgentID      string                 // for agent rules
    FleetID      string
}

type Rule interface {
    ID() string
    Evaluate(event map[string]interface{}, ctx *EvalContext) *Action  // nil = no action
}
```

### Engine Orchestrator

```go
// engine.go
type Engine struct {
    convex *convex.Client
    dedup  *DedupCache
    rules  []Rule
}

func New(c *convex.Client) *Engine {
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

func (e *Engine) Evaluate(event map[string]interface{}) {
    ctx := e.buildContext(event)  // one batch of Convex queries
    for _, rule := range e.rules {
        action := rule.Evaluate(event, ctx)
        if action == nil {
            continue
        }
        if e.dedup.ShouldSuppress(action) {
            continue
        }
        e.persistAction(action, event)
        if action.Severity == SeverityAutoAct {
            e.applyAutoAction(action)
        }
    }
}
```

---

## EvalContext

Fetched once before any rule evaluates. All Convex reads happen here.

```go
type VendorStats struct {
    Domain           string
    SuccessRate      float64    // sliding window: last 50 events or 24h
    AvgLatencyMs     float64
    P90LatencyMs     float64
    EventCount       int64
    FailureStreak    int        // consecutive recent failures
    Last10Outcomes   []string
    IsBlocked        bool
    BlockCount24h    int64
    LastBlockedAt    float64
    LatencyTrend     string     // "improving" | "stable" | "degrading"
}

type AgentAggregates struct {
    AgentID       string
    DailySpend    float64
    AvgDaily7d    float64
    AvgTxAmount   float64
    TotalEvents   int64
    ActiveDays    int          // days with at least one event
}

type FleetAggregates struct {
    FleetID           string
    HourlySpend       float64
    AvgHourly7d       float64
    ActiveAgentsNow   int64
    AvgActiveAgents7d float64
}

type EvalContext struct {
    Vendor  *VendorStats      // nil if no domain on event
    Agent   *AgentAggregates
    Fleet   *FleetAggregates
    // Per-(agent, domain) edge stats for SA-2 vendor context
    EdgeAvgPayment float64    // 0 if no edge history
    EdgeEventCount int64
}
```

Convex queries used:
- `vendors:getStatsForEngine` — computes VendorStats from sliding window scan of `payment_events` for (domain, last 50 events or 24h, whichever smaller). Computes: success_rate, p90_latency_ms, avg_latency_ms, failure_streak (consecutive tail failures), latency_trend (compare current p90 to previous window p90). This is a read-time computation, not stored.
- `aggregates:getAgentAggregates` — reads from `agent_aggregates` table
- `aggregates:getFleetAggregates` — reads from `fleet_aggregates` table
- `aggregates:getEdgeStats` — reads from `payment_edges` for (agent, domain) pair

---

## Materialized Aggregate Tables

Two new Convex tables, updated on every ingest (before the engine runs).

### agent_aggregates

```typescript
agent_aggregates: defineTable({
  agent_id: v.string(),
  fleet_id: v.string(),
  daily_spend: v.float64(),
  daily_spend_date: v.string(),    // "2026-04-08" — reset when date changes
  avg_daily_7d: v.float64(),       // exponential moving average
  avg_tx_amount: v.float64(),      // EMA of last 50 transactions
  total_events: v.int64(),
  active_days: v.int64(),          // distinct days with events
  success_rate: v.float64(),
  last_active: v.float64(),
})
.index("by_agent", ["agent_id"])
.index("by_fleet", ["fleet_id"]),
```

### fleet_aggregates

```typescript
fleet_aggregates: defineTable({
  fleet_id: v.string(),
  hourly_spend: v.float64(),
  hourly_spend_since: v.float64(), // start of current 1-hour window
  avg_hourly_7d: v.float64(),      // EMA
  active_agents_now: v.int64(),    // agents with events in last 60 min
  avg_active_agents_7d: v.float64(),
  total_spend_today: v.float64(),
  today_date: v.string(),          // "2026-04-08"
})
.index("by_fleet", ["fleet_id"]),
```

Rolling averages use **exponential moving average (EMA)** with alpha = 0.2. Simple to compute at write time, no historical scan needed.

```
new_ema = alpha * new_value + (1 - alpha) * old_ema
```

---

## Ingest Pipeline (updated)

```
POST /api/ingest/payment
  1. Insert event → events:insert
  2. Insert trace → traces:insert
  3. Insert policy decisions → policies:insertDecision (loop)
  4. Update vendor_registry stats → vendors:updateStats
  5. Update agent_aggregates → aggregates:updateAgent
  6. Update fleet_aggregates → aggregates:updateFleet
  7. Update payment_edges → edges:upsert
  8. engine.Evaluate(event)         ← NEW
  9. BatchManager.OnTraceIngested() (existing)
```

Steps 4–7 happen before engine evaluation so context reads in step 8 see fresh data.

---

## Rule Specifications (Hardened)

### VH-1: Auto-Block Unhealthy Vendor

```
TRIGGER:    Every payment_event with a domain
CONDITION:  ctx.Vendor.SuccessRate < 0.50
            AND ctx.Vendor.EventCount >= 10
            AND ctx.Vendor.FailureStreak >= 3
ACTION:     vendors:blockVendor (sets is_blocked=true, blocked_until=now+1h)
            intelligence_actions: type=auto_block, severity=AUTO_ACT
COOLDOWN:   First block: auto-unblock after 1h
            Second block in 24h: auto-unblock after 6h
            Third block in 24h: no auto-unblock (operator review required)
EVIDENCE:   {domain, success_rate, event_count, failure_streak,
             last_10_outcomes, cooldown_level, auto_unblock_at}
DEDUP:      No dedup — each block is a distinct event
```

VH-1 is the only AUTO-ACT rule. Block takes effect on next payment because `policies:getWithContext` reads `is_blocked` from vendor_registry.

A background Convex scheduled function (`vendors:processAutoUnblocks`) runs every 5 minutes to unblock vendors whose `blocked_until` timestamp has passed.

### VH-2: Flag Slow Vendor

```
TRIGGER:    Every payment_event with a domain
CONDITION:  ctx.Vendor.P90LatencyMs > 5000
            AND ctx.Vendor.EventCount >= 5
ACTION:     intelligence_actions: type=auto_flag, severity=FLAG
EVIDENCE:   {domain, p90_latency_ms, avg_latency_ms, event_count, latency_trend}
DEDUP:      One flag per domain per 24h
```

### SA-1: Agent Spend Anomaly

```
TRIGGER:    Every payment_event
CONDITION:  ctx.Agent.DailySpend > 2.0 * ctx.Agent.AvgDaily7d
            AND ctx.Agent.AvgDaily7d >= 10.0
            AND ctx.Agent.ActiveDays >= 3
ACTION:     intelligence_actions: type=auto_alert, severity=ALERT
EVIDENCE:   {agent_id, daily_spend, avg_daily_7d, pct_over,
             top_3_vendors_today, triggering_event_id}
DEDUP:      One alert per agent per calendar day
```

`top_3_vendors_today`: fetched from `payment_events` for (agent, today). Extra read but makes the alert actionable.

### SA-2: Unusual Single Payment

```
TRIGGER:    Every payment_event
CONDITION:  event.amount > 5.0 * ctx.Agent.AvgTxAmount
            AND ctx.Agent.TotalEvents >= 10
            AND event.amount > 5.00
            AND (ctx.EdgeEventCount < 5 OR event.amount > 3.0 * ctx.EdgeAvgPayment)
ACTION:     intelligence_actions: type=auto_flag, severity=FLAG
EVIDENCE:   {event_id, amount, agent_avg_tx_amount, vendor_avg_for_agent,
             domain, standard}
DEDUP:      No dedup — each unusual payment is distinct
```

### SA-3: Fleet Spend Spike

```
TRIGGER:    Every payment_event
CONDITION:  ctx.Fleet.HourlySpend > 3.0 * ctx.Fleet.AvgHourly7d
            AND ctx.Fleet.AvgHourly7d >= 50.0
ACTION:     intelligence_actions: type=auto_alert, severity=ALERT
EVIDENCE:   {fleet_id, hourly_spend, avg_hourly_7d, active_agents_now,
             avg_active_agents_7d, concentration_score, top_3_agents_this_hour}
DEDUP:      One alert per fleet per 6h
```

`concentration_score = top_agent_hourly_spend / fleet.hourly_spend`. Fetched from `payment_events` for (fleet, last hour). If > 0.7, single agent is driving the spike.

### RO-1: Expensive Bridge Warning

```
TRIGGER:    Every payment_event where bridge was used
CONDITION:  bridge_cost_pct > 20.0
            AND bridge_cost_absolute > 1.00
DETECT:     instrument_type contains "bridge"
            OR trace.bridge_scoring is non-null
            bridge_cost extracted from trace.economic_rationality_check
ACTION:     intelligence_actions: type=auto_alert, severity=ALERT
EVIDENCE:   {event_id, bridge_cost, payment_amount, bridge_cost_pct,
             chain_from, chain_to, protocol_used,
             suggestion: "Rebalance funds to {chain_to}"}
DEDUP:      One alert per (agent, chain_from→chain_to) pair per 24h
```

---

## Alert Deduplication

In-memory cache in the Go server process. Key: `"{rule_id}:{subject}:{date}"`.

```go
// dedup.go
type DedupCache struct {
    mu    sync.Mutex
    seen  map[string]time.Time
}

// Subject is agent_id, domain, fleet_id, or "agent:chain" depending on rule
func (d *DedupCache) ShouldSuppress(action *Action) bool
```

Dedup windows by rule:
- VH-2: domain, 24h
- SA-1: agent_id, calendar day
- SA-3: fleet_id, 6h
- RO-1: `{agent_id}:{chain_from}-{chain_to}`, 24h
- VH-1, SA-2: no dedup

Cache is in-memory (reset on server restart). For hackathon this is fine — a restart just means a duplicate alert, not a missed one. Post-hackathon: persist dedup state in Convex.

---

## New Convex Functions Required

| Function | Type | Purpose |
|---|---|---|
| `aggregates:updateAgent` | Mutation | Upsert agent_aggregates after ingest |
| `aggregates:updateFleet` | Mutation | Upsert fleet_aggregates after ingest |
| `aggregates:getAgentAggregates` | Query | Read agent context for engine |
| `aggregates:getFleetAggregates` | Query | Read fleet context for engine |
| `aggregates:getEdgeStats` | Query | Read (agent, domain) edge stats |
| `vendors:updateStats` | Mutation | Update vendor_registry after ingest |
| `vendors:getStatsForEngine` | Query | Full vendor stats for engine context |
| `vendors:blockVendor` | Mutation | Set is_blocked, blocked_until, increment block_count_24h |
| `vendors:processAutoUnblocks` | Scheduled Action | Run every 5 min, unblock expired vendors |
| `intelligence:insertAction` | Mutation | Write to intelligence_actions table |

---

## Error Handling

- Engine errors **do not fail the ingest request**. If `engine.Evaluate()` panics or errors, it is logged and the ingest response returns 200.
- Individual rule errors are caught per-rule. One bad rule doesn't block others.
- Convex write failures for actions are logged but not retried (best-effort — a missed action log is acceptable, a failed ingest is not).

---

## What's Not In This Spec

- Intelligence actions API endpoint (GET /api/intelligence/actions for dashboard feed)
- WebSocket push for ALERT/AUTO-ACT actions (RHE-22 — superseded by Convex real-time)
- Operator override / undo (RHE-23 stretch)
- Configuration API for thresholds (post-hackathon)
- VH-3 stale vendor (scheduled rule, different trigger)
- RO-2/3, PE-1/2/3, TO-1/2 (post-hackathon)
