# Rhemify Intelligence Layer — Design Spec

## Scope

This spec covers the intelligence layer as it ships at Colosseum Frontier (Apr 6 - May 11, 2026). It defines how the system ingests payment data, computes intelligence, takes autonomous actions within operator-defined guardrails, surfaces insights to operators, and feeds decisions back into the payment runtime.

The intelligence layer is an **active participant** — it records, analyzes, and acts. It is powered by a **deterministic rules engine** — every action is explainable, traceable, and replayable.

See `docs/intelligence-layer-diagram.md` for the full Mermaid diagrams of system flow, rules engine, action lifecycle, and single-payment sequence.

---

## Core Principles

1. **Instrument from transaction one.** Missing early data cannot be recovered. Every payment emits a full event + trace from the first call to `rhemify.pay()`.

2. **Capture WHY, not just WHAT.** Payment events record what happened. Decision traces record why it happened — agent context, alternatives evaluated, policy rules fired, confidence signals.

3. **Deterministic and explainable.** Every intelligence action is the result of a rule with an explicit condition and threshold. No black boxes. An operator can always answer "why did the system do that?"

4. **Active within guardrails.** The intelligence layer can auto-block vendors, auto-route to cheaper paths, and flag anomalies — but only within boundaries the operator sets. Every auto-action is reversible.

5. **Append-only, immutable traces.** Decision traces are never modified after creation. This is the compliance and audit story. Traces are forensic evidence, not logs.

---

## 1. Event Ingestion

### What Gets Recorded

Every call to `rhemify.pay()` emits three categories of data, regardless of outcome:

**Payment Event** — the facts of what happened.

| Field | Source | Example |
|---|---|---|
| id | Generated UUID | `evt_a1b2c3` |
| timestamp | System clock (ISO 8601) | `2026-04-15T14:32:01Z` |
| agent_id | From fleet registry | `agent-7` |
| fleet_id | From fleet registry | `fleet-rhemify-prod` |
| standard | Standard Detector | `x402` |
| standard_version | From 402 headers | `1.0.0` |
| amount | From PaymentIntent | `0.50` |
| token | From PaymentIntent | `USDC` |
| chain_from | From wallet manifest | `solana` |
| chain_to | From 402 response | `solana` |
| domain | Parsed from URL | `api.bloomberg.com` |
| outcome | From executor | `success` / `rejected` / `failed` |
| parent_event_id | If delegated payment | `evt_x9y8z7` or null |
| delegation_depth | Computed | `0` |
| instrument_type | From path resolver | `ows` / `privy` / `agentcard` |
| trace_id | Links to trace | `trc_d4e5f6` |

**Decision Trace** — the reasoning behind the payment.

| Field | Source | Purpose |
|---|---|---|
| id | Generated UUID | Primary key |
| payment_event_id | Links to event | Join key |
| agent_task_description | From agent context | "Researching market data for Q1 report" |
| agent_task_step | From agent context | `3` |
| trigger_402_raw | Captured HTTP response | Full headers + body of the 402 |
| standard_detected | Standard Detector | `x402` |
| standard_confidence | Standard Detector | `high` / `medium` / `low` |
| alternatives_evaluated | Path Resolver | `[{path: "agentcard_mpp_spt", rejected_reason: "insufficient_balance"}, ...]` |
| policy_rules_fired | Policy Engine | `[{rule: "daily_limit", value: "$340/$500", result: "pass"}, ...]` |
| instrument_selection_log | Path Resolver | "OWS Solana selected: cheapest path, direct chain match" |
| bridge_scoring | Path Resolver | `{cctp: {cost: 0.002, time: 5s}, relay: {cost: 0.05, time: 30s}}` or null |
| economic_rationality_check | Path Resolver | `{bridge_cost_pct: 0.4, threshold: 20, passed: true}` or null |
| task_outcome | Linked later | `success` / `failure` / `pending` / null |
| task_outcome_linked_at | Linked later | ISO 8601 or null |
| replay_snapshot | Snapshot at decision time | `{wallet_manifest, policy_state, vendor_registry_snapshot, agent_context}` |

**Policy Decisions** — every rule evaluation, whether it passed or blocked.

| Field | Source | Example |
|---|---|---|
| id | Generated UUID | `pdec_g7h8i9` |
| payment_event_id | Links to event | `evt_a1b2c3` |
| rule_triggered | Policy Engine | `daily_limit` |
| decision | Policy Engine | `allow` / `flag` / `block` |
| threshold | Policy config | `500.00` |
| domain | From PaymentIntent | `api.bloomberg.com` |
| standard | From PaymentIntent | `x402` |
| human_approval_required | Policy Engine | `false` |

### Ingestion Guarantees

- **Idempotent writes.** Duplicate event IDs are silently ignored. The runtime may retry on network failure without creating duplicates.
- **Append-only.** Events and traces are never updated or deleted. `task_outcome` and `task_outcome_linked_at` are the only fields written after initial insert (via a separate linking operation).
- **Ordered within agent.** Events for a single agent are ordered by timestamp. Cross-agent ordering is best-effort.

---

## 2. Derived Data (Computed on Every Event)

These tables are updated as a side effect of every ingested payment event. They are the data that the rules engine evaluates against.

### Vendor Registry

Updated on every payment event. No manual curation — purely auto-built from transaction data.

| Field | Computation | Example |
|---|---|---|
| domain | From payment event | `api.bloomberg.com` |
| supported_standards | Set of all standards seen | `["x402", "mpp"]` |
| success_rate | `successes / total` (last 100 events or 30 days, whichever is smaller) | `0.92` |
| avg_latency_ms | Rolling average of execution time | `340` |
| uptime_pct | `(1 - failure_rate) * 100` | `98.5` |
| last_seen | Timestamp of most recent event | `2026-04-15T14:32:01Z` |
| total_spend | Sum of all successful payment amounts | `127.50` |
| event_count | Total events (all outcomes) | `156` |
| cost_per_success | `total_spend / successful_task_outcomes` | `0.85` |
| is_blocked | Set by intelligence rules or operator | `false` |
| blocked_reason | Why it was blocked | `"auto_blocked: success_rate 38% < 50%"` |
| blocked_at | When it was blocked | ISO 8601 or null |
| source | Origin of vendor data | `"observed"` / `"agentcash_seed"` |

**Seed data:** AgentCash's 338 endpoints are seeded on Day 1 with `source: "agentcash_seed"`. Their fields populate from observed data as real transactions flow.

### Payment Edges (Graph)

Updated on every payment event. Tracks the payment graph: who pays whom.

| Field | Computation |
|---|---|
| from_agent_id | Agent that made the payment |
| to_service | Domain that received payment |
| to_agent_id | If payment was to another agent (delegation) |
| delegation_depth | How deep in the delegation chain |
| event_count | Number of payments on this edge |
| cumulative_spend | Total amount on this edge |
| last_event_at | Most recent payment on this edge |

### Agent Aggregates

Computed on every event. Powers anomaly detection.

| Field | Computation |
|---|---|
| agent_id | Agent identifier |
| daily_spend | Sum of today's successful payments (resets midnight UTC) |
| 7d_avg_daily | Average daily spend over last 7 days |
| avg_tx_amount | Rolling average transaction amount (last 50 txs) |
| total_events | Total lifetime events |
| success_rate | Agent's overall success rate |
| last_active | Timestamp of most recent event |

### Fleet Aggregates

Computed on every event. Powers fleet-level monitoring.

| Field | Computation |
|---|---|
| fleet_id | Fleet identifier |
| hourly_spend | Sum of last 60 minutes of successful payments |
| 7d_avg_hourly | Average hourly spend over last 7 days |
| active_agents | Count of agents with events in last hour |
| total_spend_today | Fleet-wide spend since midnight UTC |
| total_spend_alltime | Fleet-wide lifetime spend |
| blocked_count_today | Policy rejections today |

---

## 3. Rules Engine

The rules engine is the active brain of the intelligence layer. It evaluates conditions against the derived data above and takes actions. Every rule follows the same structure:

```
TRIGGER: what event causes the rule to evaluate
CONDITION: what must be true (against derived data)
THRESHOLD: the numeric boundary (operator-configurable)
ACTION: what the system does
SEVERITY: LOG / FLAG / ALERT / AUTO-ACT
EVIDENCE: what data is attached to justify the action
REVERSIBLE: whether operator can undo
```

### Rule Category 1: Vendor Health

**Rule VH-1: Auto-Block Unhealthy Vendor**

```
TRIGGER:   Every payment_event targeting this vendor
CONDITION: vendor.success_rate < threshold AND vendor.event_count >= min_sample
THRESHOLD: success_rate < 50% (default), min_sample = 10 (default)
ACTION:    Add vendor domain to fleet blocked_domains list
SEVERITY:  AUTO-ACT
EVIDENCE:  {domain, success_rate, event_count, last_10_outcomes}
REVERSIBLE: Yes — operator can unblock from dashboard or via rhemify.set_policy
```

**Rule VH-2: Flag Slow Vendor**

```
TRIGGER:   Every payment_event targeting this vendor
CONDITION: vendor.avg_latency_ms > threshold AND vendor.event_count >= min_sample
THRESHOLD: avg_latency_ms > 5000 (default), min_sample = 5 (default)
ACTION:    Mark vendor as "slow" in dashboard, visible in vendor intelligence view
SEVERITY:  FLAG
EVIDENCE:  {domain, avg_latency_ms, p95_latency_ms, event_count}
REVERSIBLE: N/A (flag only)
```

**Rule VH-3: Mark Stale Vendor**

```
TRIGGER:   Scheduled evaluation (every 5 minutes)
CONDITION: vendor.last_seen < (now - staleness_window)
THRESHOLD: staleness_window = 7 days (default)
ACTION:    Log vendor as stale, available in analytics
SEVERITY:  LOG
EVIDENCE:  {domain, last_seen, days_since_last_event}
REVERSIBLE: N/A (log only)
```

### Rule Category 2: Spend Anomaly

**Rule SA-1: Agent Spend Anomaly**

```
TRIGGER:   Every payment_event
CONDITION: agent.daily_spend > (multiplier * agent.7d_avg_daily)
           AND agent.7d_avg_daily > 0 (skip new agents)
THRESHOLD: multiplier = 2x (default)
ACTION:    Push alert to operator via WebSocket
SEVERITY:  ALERT
EVIDENCE:  {agent_id, daily_spend, 7d_avg_daily, triggering_event_id}
REVERSIBLE: N/A (alert only, operator decides action)
```

**Rule SA-2: Unusual Single Payment**

```
TRIGGER:   Every payment_event
CONDITION: payment.amount > (multiplier * agent.avg_tx_amount)
           AND agent.total_events >= min_history
THRESHOLD: multiplier = 5x (default), min_history = 10 (default)
ACTION:    Flag payment in dashboard
SEVERITY:  FLAG
EVIDENCE:  {event_id, amount, avg_tx_amount, multiplier}
REVERSIBLE: N/A (flag only)
```

**Rule SA-3: Fleet Spend Spike**

```
TRIGGER:   Every payment_event
CONDITION: fleet.hourly_spend > (multiplier * fleet.7d_avg_hourly)
           AND fleet.7d_avg_hourly > 0
THRESHOLD: multiplier = 3x (default)
ACTION:    Push alert to operator
SEVERITY:  ALERT
EVIDENCE:  {fleet_id, hourly_spend, 7d_avg_hourly, top_spending_agents}
REVERSIBLE: N/A (alert only)
```

### Rule Category 3: Route Optimization

**Rule RO-1: Expensive Bridge Warning**

```
TRIGGER:   Every payment_event where bridge was used
CONDITION: bridge_cost_pct > threshold
           AND alternative direct path exists on another chain
THRESHOLD: bridge_cost_pct > 20% (default)
ACTION:    Alert operator to consider rebalancing funds to the target chain
SEVERITY:  ALERT
EVIDENCE:  {event_id, bridge_cost, bridge_cost_pct, alternative_chain, estimated_savings}
REVERSIBLE: N/A (recommendation)
```

**Rule RO-2: Missed Standard Optimization**

```
TRIGGER:   Every payment_event
CONDITION: vendor supports standard_A with lower cost
           AND agent used standard_B
           AND cost_difference > threshold
THRESHOLD: cost_difference > $0.01 per tx (default)
ACTION:    Log for analytics — informs future path resolver scoring
SEVERITY:  LOG
EVIDENCE:  {event_id, standard_used, cheaper_standard, cost_difference}
REVERSIBLE: N/A (log only)
```

**Rule RO-3: Auto-Route to Cheaper Path**

```
TRIGGER:   Path Resolver scoring (inline, before execution)
CONDITION: historical data shows path_A is consistently cheaper/faster than path_B
           for this vendor AND confidence >= high (10+ data points)
THRESHOLD: cost_savings > 10% AND sample_size >= 10 (default)
ACTION:    Boost path_A score in Path Resolver by configured weight
SEVERITY:  AUTO-ACT (within guardrails)
EVIDENCE:  {vendor, path_boosted, historical_cost_avg, sample_size}
REVERSIBLE: Yes — operator can disable auto-routing in policy
```

### Rule Category 4: Policy Effectiveness

**Rule PE-1: Overtight Policy Alert**

```
TRIGGER:   Every policy_decision where decision = "block"
CONDITION: rule.block_rate > threshold over evaluation_window
THRESHOLD: block_rate > 50% over 7 days (default)
ACTION:    Alert operator that a policy rule may be too restrictive
SEVERITY:  ALERT
EVIDENCE:  {rule_name, block_count, total_evaluations, block_rate, sample_blocked_events}
REVERSIBLE: N/A (recommendation)
```

**Rule PE-2: Unused Rule Suggestion**

```
TRIGGER:   Scheduled evaluation (daily)
CONDITION: rule.fire_count == 0 over evaluation_window
THRESHOLD: evaluation_window = 30 days (default)
ACTION:    Log suggestion to clean up unused rule
SEVERITY:  LOG
EVIDENCE:  {rule_name, days_since_last_fire}
REVERSIBLE: N/A (log only)
```

**Rule PE-3: Approval Queue Backlog**

```
TRIGGER:   Every policy_decision where decision = "flag" (queued for approval)
CONDITION: pending_approval_count > threshold
THRESHOLD: pending_count > 10 (default)
ACTION:    Alert operator that approval queue is growing
SEVERITY:  ALERT
EVIDENCE:  {pending_count, oldest_pending_age, top_pending_agents}
REVERSIBLE: N/A (alert only)
```

### Rule Category 5: Task Outcome Intelligence

**Rule TO-1: Inefficient Vendor**

```
TRIGGER:   Task outcome linked to payment
CONDITION: vendor.cost_per_success > (multiplier * fleet_avg_cost_per_success)
           AND vendor.outcome_count >= min_sample
THRESHOLD: multiplier = 2x (default), min_sample = 5 (default)
ACTION:    Flag vendor in dashboard
SEVERITY:  FLAG
EVIDENCE:  {domain, cost_per_success, fleet_avg, outcome_count}
REVERSIBLE: N/A (flag only)
```

**Rule TO-2: Low-ROI Agent**

```
TRIGGER:   Task outcome linked to payment
CONDITION: agent.payment_to_success_ratio < threshold
           AND agent.outcome_count >= min_sample
THRESHOLD: success_ratio < 50% (default), min_sample = 10 (default)
ACTION:    Alert operator
SEVERITY:  ALERT
EVIDENCE:  {agent_id, success_count, total_payments, ratio, recent_failures}
REVERSIBLE: N/A (alert only)
```

---

## 4. Intelligence Actions

Every action the rules engine takes is recorded in the `intelligence_actions` table:

| Field | Description |
|---|---|
| id | Generated UUID |
| timestamp | When the action was taken |
| action_type | `auto_block` / `auto_flag` / `auto_alert` / `recommend` / `auto_route` / `log` |
| severity | `LOG` / `FLAG` / `ALERT` / `AUTO_ACT` |
| trigger_rule | Which rule fired (e.g., `VH-1`) |
| trigger_event_id | The payment event that triggered it |
| evidence | JSON blob with all supporting data |
| action_detail | What specifically was done (e.g., "blocked domain api.example.com") |
| outcome | `executed` / `pending_review` / `dismissed` / `reversed` |
| operator_override | null / `confirmed` / `reversed` / `dismissed` |
| operator_override_at | Timestamp of operator action |
| operator_note | Optional note from operator |

### Action Severity Behaviors

**LOG** — Recorded in `intelligence_actions`. No notification. Available in analytics and vendor intelligence views. Used for observations that inform future analysis (missed optimizations, stale vendors).

**FLAG** — Recorded in `intelligence_actions`. Marked visually in the dashboard (badge on event, yellow highlight on vendor row). Operator sees on next dashboard visit. Does NOT block any payment.

**ALERT** — Recorded in `intelligence_actions`. Pushed to operator in real-time via WebSocket. Appears in the Intelligence Feed on the dashboard with a notification badge. Operator should act but nothing is blocked automatically.

**AUTO-ACT** — Recorded in `intelligence_actions`. System takes immediate action (modifies policy or routing). The action takes effect on the **next** payment (not retroactive). Pushed to operator via WebSocket with full evidence. Operator can reverse within the override window. If reversed, original state is restored and the reversal is logged.

### Guardrails on Auto-Actions

Auto-actions are the only actions that modify system behavior without operator approval. They require guardrails:

1. **Operator must opt in.** Auto-actions are disabled by default. Operator enables them per rule category via `rhemify.set_policy({ intelligence: { auto_block_vendors: true, auto_route: true } })`.

2. **Minimum sample size.** No auto-action fires with fewer than the minimum sample size (default 10 events for vendor health, 10 transactions for route optimization). This prevents overreacting to small samples.

3. **Rate limit.** Maximum 5 auto-actions per hour per fleet. If the limit is hit, remaining actions are downgraded to ALERT severity and queued for operator review.

4. **Reversal window.** Every auto-action can be reversed by the operator at any time. The dashboard shows a prominent "Undo" button on recent auto-actions.

5. **Audit trail.** Every auto-action, including reversals, is recorded in `intelligence_actions` with full evidence. This is the compliance story.

---

## 5. Decision Replay

The replay engine reconstructs the exact context of any historical payment decision and re-runs it in a sandbox.

### How Replay Works

1. **Load snapshot.** Read `replay_snapshot` from the payment trace. This contains: wallet manifest at decision time, fleet policy at decision time, vendor registry state at decision time, agent context.

2. **Reconstruct environment.** Create an in-memory sandbox with the snapshot data. No real wallets, no real chains, no real vendors.

3. **Re-run policy engine.** Evaluate the same PaymentIntent against the snapshot policy. Record which rules pass/fail.

4. **Re-run path resolver.** Score instruments against the snapshot wallet manifest and vendor data. Record which path is selected.

5. **Return diff.** Compare original trace vs replayed trace. Highlight differences in policy outcomes, path selection, and instrument choice.

### Counterfactual Analysis

The replay endpoint accepts an optional `policy_overrides` parameter:

```json
POST /api/traces/:id/replay
{
  "policy_overrides": {
    "daily_limit": 100,        // was 500
    "allowed_domains": ["-api.bloomberg.com"]  // remove bloomberg
  }
}
```

The engine replays with the modified policy and returns what would have happened. This enables:

- **"What if I lower the limit?"** — see which payments would have been blocked
- **"What if I block this domain?"** — see the impact before committing
- **"Why didn't the policy catch this?"** — replay with a tighter policy to verify it would have worked

### What Replay Does NOT Do

- Does NOT execute real payments
- Does NOT modify any stored data
- Does NOT guarantee the same LLM output (agent behavior is non-deterministic)
- DOES reconstruct the payment decision context faithfully

The value is forensic — context reconstruction — not prediction.

---

## 6. Operator-Facing Surfaces

### Intelligence Feed (Dashboard)

A dedicated panel on the fleet dashboard showing intelligence activity:

- **Recent auto-actions** with evidence and "Undo" buttons
- **Pending recommendations** with "Accept" / "Dismiss" buttons
- **Active alerts** sorted by recency
- **Flags** grouped by type (vendor, spend, policy)

Each item in the feed links to the underlying payment event and trace.

### Vendor Intelligence View

A table of all known vendors with computed intelligence:

| Column | Source | Visual Treatment |
|---|---|---|
| Domain | vendor_registry | Text |
| Success Rate | Computed | Color-coded: green (>80%), yellow (50-80%), red (<50%) |
| Avg Latency | Computed | Color-coded: green (<1s), yellow (1-5s), red (>5s) |
| Standards | Observed | Badges (x402, MPP, L402) |
| Total Spend | Computed | Currency formatted |
| Cost/Success | Computed from task outcomes | Currency formatted |
| Status | is_blocked flag | Badge: Active / Blocked / Stale |
| Last Seen | vendor_registry | Relative time ("2h ago") |

Blocked vendors are highlighted red with the blocked reason visible on hover. Operator can unblock with one click.

### Policy Editor Intelligence Integration

The policy editor shows intelligence suggestions inline:

- Next to `daily_limit`: "Agent-3 averages $120/day. Current limit is $500. Consider lowering to $200."
- Next to `allowed_domains`: "api.flaky-vendor.com was auto-blocked (38% success rate). Click to review."
- Next to `approval_threshold`: "10 payments pending approval. Consider raising threshold from $5 to $20."

Suggestions are non-blocking — they appear as subtle hints, not modal interrupts.

### Trace Viewer Intelligence Annotations

When viewing a decision trace, the intelligence layer adds annotations:

- If the vendor was later blocked: "This vendor was auto-blocked 3 days after this payment (success_rate dropped to 38%)"
- If a cheaper path was available: "A direct Solana USDC path would have saved $0.04 (bridge cost was $0.05)"
- If the payment led to task failure: "This payment's task outcome was: failure. The agent retried with a different vendor."

These annotations are computed on-read, not stored — they reflect the current state of intelligence data.

---

## 7. Agent-Facing Behaviors

The intelligence layer doesn't just inform operators — it actively changes how payments are processed.

### Policy Engine: intelligence_rules Step

The policy engine evaluates a new step (step 9 in the evaluation order) called `intelligence_rules`. This step checks:

1. **Is the vendor blocked by intelligence?** If vendor.is_blocked == true AND blocked by auto-action, reject with `{ rejected: true, reason: "vendor_auto_blocked", rule: "VH-1", suggestion: "Vendor success_rate is 38%. Try alternative vendor." }`.

2. **Is there an active fleet-level alert?** If fleet spend spike alert is active, optionally increase scrutiny (lower approval_threshold temporarily).

3. **Should the path be optimized?** Pass intelligence routing hints to the Path Resolver (prefer cheaper path based on historical data).

The agent never sees the intelligence layer directly. It sees the effects: a payment rejected with a clear reason, a cheaper path automatically selected, a vendor blocked before the agent even tries.

### Structured Rejections

When the intelligence layer blocks a payment, the rejection includes actionable context:

```json
{
  "rejected": true,
  "reason": "vendor_auto_blocked",
  "rule": "VH-1",
  "evidence": {
    "domain": "api.flaky-vendor.com",
    "success_rate": 0.38,
    "threshold": 0.50,
    "blocked_since": "2026-04-14T10:00:00Z"
  },
  "suggestion": "Try an alternative vendor for this data. Known alternatives: api.reliable-vendor.com (success_rate: 94%)"
}
```

This allows the agent to gracefully handle the rejection and try a different approach — which is then also traced.

---

## 8. Configuration

All intelligence rules are configurable via `rhemify.set_policy()` under the `intelligence` key:

```typescript
rhemify.set_policy({
  intelligence: {
    // Master switch
    enabled: true,

    // Auto-action opt-in (all default false)
    auto_block_vendors: true,
    auto_route_optimization: true,

    // Vendor health thresholds
    vendor_block_threshold: 0.50,       // success_rate below this → auto-block
    vendor_block_min_sample: 10,        // minimum events before auto-block
    vendor_slow_threshold: 5000,        // ms — flag as slow
    vendor_stale_days: 7,               // days without events → mark stale

    // Spend anomaly thresholds
    agent_spend_anomaly_multiplier: 2,  // daily spend > 2x 7-day avg → alert
    unusual_payment_multiplier: 5,      // single tx > 5x avg → flag
    fleet_spike_multiplier: 3,          // hourly spend > 3x 7-day avg → alert

    // Route optimization
    bridge_cost_alert_pct: 20,          // bridge cost > 20% of payment → alert
    auto_route_min_sample: 10,          // minimum data points before auto-routing
    auto_route_savings_threshold: 10,   // % savings required to auto-route

    // Policy effectiveness
    overtight_block_rate: 50,           // rule blocking > 50% of payments → alert
    unused_rule_days: 30,               // no fires in 30 days → suggest cleanup

    // Task outcome
    inefficient_vendor_multiplier: 2,   // cost/success > 2x fleet avg → flag
    low_roi_agent_threshold: 50,        // success ratio < 50% → alert

    // Guardrails
    max_auto_actions_per_hour: 5,       // rate limit on auto-actions
  }
})
```

Defaults are designed to be conservative. Operators tighten or loosen as they gain confidence in the system.

---

## 9. Data Retention

| Data Type | Retention | Rationale |
|---|---|---|
| payment_events | Permanent | Core audit trail, small per-record |
| payment_traces | 90 days full, then compressed summary | Full traces are large (replay_snapshot). After 90 days, compress to summary (drop snapshot, keep all other fields). |
| policy_decisions | Permanent | Small per-record, needed for policy effectiveness analysis |
| vendor_registry | Permanent (current state) | Single row per vendor, updated in place |
| payment_edges | Permanent | Small, needed for graph queries |
| intelligence_actions | Permanent | Audit trail for all auto-actions |
| agent_aggregates | Rolling 30 days | Only needed for anomaly detection baselines |
| fleet_aggregates | Rolling 30 days | Only needed for spike detection |

---

## 10. Demo Scenarios

### Scenario A: Vendor Auto-Block

1. Agent makes 15 payments to `api.flaky-vendor.com`. First 8 succeed, next 7 fail.
2. After failure #7, success_rate drops to 53% (8/15). Still above threshold.
3. Agent makes payment #16. It fails. Success_rate = 50% (8/16). Still at threshold.
4. Agent makes payment #17. It fails. Success_rate = 47% (8/17). **Below threshold.**
5. Intelligence rule VH-1 fires. Vendor is auto-blocked.
6. Dashboard: alert appears in Intelligence Feed. Vendor row turns red in Vendor Intelligence view.
7. Agent makes payment #18 to the same vendor. **Rejected** with `vendor_auto_blocked` and suggestion to try alternative.
8. Operator reviews in dashboard. Can click "Unblock" to reverse, or leave the block in place.

**Demo talking point:** "The system learned that this vendor was failing and blocked it before the agent wasted more money. Every auto-action has full evidence and is reversible."

### Scenario B: Spend Anomaly Alert

1. Agent-7 has been averaging $120/day for the past week.
2. Agent-7 starts a new task that requires many API calls. By noon, it's spent $280.
3. $280 > 2 * $120 = $240. Rule SA-1 fires.
4. Dashboard: alert pushed via WebSocket. "Agent-7 spend anomaly: $280 today vs $120 7-day average."
5. Operator investigates: opens Agent-7 detail page, sees the burst of payments, reviews the traces.
6. Operator decides: this is expected (new task requires more data). Dismisses the alert.
7. Dismissal is logged in intelligence_actions.

**Demo talking point:** "The system flagged unusual spending in real-time. The operator investigated and confirmed it was intentional. The dismissal is logged — full audit trail."

### Scenario C: Decision Replay

1. Agent-3 made a payment to Bloomberg for $0.80 at 2am.
2. Next morning, operator wants to know: "Why did agent-3 pay Bloomberg at 2am?"
3. Opens the payment in the event feed. Clicks into the decision trace.
4. Sees: agent was executing step 3 of a market research task. x402 detected with high confidence. AgentCard was evaluated but rejected (insufficient balance). OWS Solana USDC was selected. Daily limit had $460 remaining.
5. Clicks "Replay." The system reconstructs the exact state and re-runs the decision. Same outcome.
6. Changes `daily_limit` to `$50` in the replay overrides. Re-runs. **This time the payment would have been blocked** (daily spend was already $40 + $0.80 = $40.80 > $50).
7. Operator now knows: if they want to prevent late-night high-spend payments, lowering the daily limit would have caught it.

**Demo talking point:** "This is time travel for payment decisions. Reconstruct any moment, ask what-if questions, and make informed policy changes."
