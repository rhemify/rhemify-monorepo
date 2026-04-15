# Decision Replay Engine Design — RHE-24

**Date:** 2026-04-15
**Author:** Soh Zhe Hong
**Status:** Approved
**Issue:** [RHE-24](https://linear.app/rhemify/issue/RHE-24/build-decision-replay-engine)

---

## Scope

Forensic replay engine that reconstructs the exact context of any historical payment decision and re-evaluates policy rules in a sandbox. Supports counterfactual analysis via policy overrides ("what if I lowered the daily limit?"). Read-only — no data written or modified.

**In scope:** Policy rule re-evaluation from replay_snapshot, policy overrides, diff generation.

**Out of scope:** Path resolver re-run (requires SDK integration), real payment execution, LLM behavior prediction, gap-filling from current data.

---

## API

### `POST /api/traces/:id/replay`

**Auth:** Requires fleet API key (SDK auth middleware).

**Request body (optional):**

```json
{
  "policy_overrides": {
    "daily_limit": 100,
    "domain_allowlist": ["-api.bloomberg.com"],
    "max_per_transaction": 50
  }
}
```

Override syntax:
- Numeric fields: replace value directly (`"daily_limit": 100`)
- Array fields: prefix `-` to remove an entry (`["-api.bloomberg.com"]`), no prefix to add
- Omitted fields: use snapshot value unchanged

**Response:**

```json
{
  "trace_id": "trc_d4e5f6",
  "snapshot_complete": true,
  "original": {
    "allowed": true,
    "rule_results": [
      {"rule": "daily_limit", "result": "pass", "threshold": "500.00", "actual": "340.80"},
      {"rule": "max_per_transaction", "result": "pass", "threshold": "100.00", "actual": "0.80"},
      {"rule": "domain_allowlist", "result": "pass", "threshold": "allowlist", "actual": "api.bloomberg.com"},
      {"rule": "standard_allowlist", "result": "pass", "threshold": "allowlist", "actual": "x402"},
      {"rule": "vendor_blocked", "result": "pass", "threshold": "not_blocked", "actual": "api.bloomberg.com"},
      {"rule": "approval_threshold", "result": "pass", "threshold": "50.00", "actual": "0.80"}
    ]
  },
  "replayed": {
    "allowed": false,
    "rule_results": [
      {"rule": "daily_limit", "result": "block", "threshold": "100.00", "actual": "340.80"},
      {"rule": "max_per_transaction", "result": "pass", "threshold": "100.00", "actual": "0.80"},
      {"rule": "domain_allowlist", "result": "block", "threshold": "allowlist", "actual": "api.bloomberg.com"},
      {"rule": "standard_allowlist", "result": "pass", "threshold": "allowlist", "actual": "x402"},
      {"rule": "vendor_blocked", "result": "pass", "threshold": "not_blocked", "actual": "api.bloomberg.com"},
      {"rule": "approval_threshold", "result": "pass", "threshold": "50.00", "actual": "0.80"}
    ]
  },
  "diff": [
    {"rule": "daily_limit", "original_result": "pass", "replayed_result": "block", "changed": true},
    {"rule": "domain_allowlist", "original_result": "pass", "replayed_result": "block", "changed": true}
  ],
  "counterfactual_blocked": true
}
```

**Error cases:**
- `404` — trace not found
- `422` — replay_snapshot missing or incomplete (returns which fields are missing)

---

## Architecture

### Package Structure

```
apps/server/internal/replay/
├── replay.go        # ReplayEngine: load snapshot → evaluate → diff
├── policy.go        # PolicyEvaluator: re-runs 6 policy rules against snapshot
├── diff.go          # Compares original vs replayed outcomes
└── replay_test.go   # Table-driven tests

apps/server/internal/handler/
└── replay.go        # HTTP handler for POST /api/traces/:id/replay
```

### Data Flow

```
POST /api/traces/:id/replay { policy_overrides }
  │
  ▼
handler/replay.go
  │ Fetch trace from Convex (traces:get)
  │ Fetch linked payment_event
  ▼
replay/replay.go — ReplayEngine.Replay(trace, event, overrides)
  │
  ├─ Extract replay_snapshot from trace
  │  └─ Validate completeness (policy_state, vendor_registry_snapshot, agent_context required)
  │
  ├─ Build original PolicyOutcome from trace.policy_rules_fired
  │
  ├─ Apply policy_overrides to snapshot.policy_state
  │
  ├─ replay/policy.go — PolicyEvaluator.Evaluate(event, snapshot_policy, snapshot_vendor, snapshot_agent)
  │  └─ Runs 6 rules: daily_limit, max_per_tx, domain_allowlist, standard_allowlist, vendor_blocked, approval_threshold
  │
  ├─ replay/diff.go — ComputeDiff(original, replayed)
  │
  └─ Return ReplayResult
```

### Types

```go
// ReplayRequest is the HTTP request body
type ReplayRequest struct {
    PolicyOverrides map[string]interface{} `json:"policy_overrides"`
}

// ReplayResult is the HTTP response
type ReplayResult struct {
    TraceID              string        `json:"trace_id"`
    SnapshotComplete     bool          `json:"snapshot_complete"`
    Original             PolicyOutcome `json:"original"`
    Replayed             PolicyOutcome `json:"replayed"`
    Diff                 []PolicyDiff  `json:"diff"`
    CounterfactualBlocked bool         `json:"counterfactual_blocked"`
}

// PolicyOutcome is the result of evaluating all policy rules
type PolicyOutcome struct {
    Allowed     bool         `json:"allowed"`
    RuleResults []RuleResult `json:"rule_results"`
}

// RuleResult is one policy rule evaluation
type RuleResult struct {
    Rule      string `json:"rule"`      // "daily_limit", "max_per_tx", etc.
    Result    string `json:"result"`    // "pass" | "block" | "flag" | "skipped"
    Threshold string `json:"threshold"` // human-readable threshold
    Actual    string `json:"actual"`    // human-readable actual value
}

// PolicyDiff highlights a rule whose outcome changed between original and replay
type PolicyDiff struct {
    Rule           string `json:"rule"`
    OriginalResult string `json:"original_result"`
    ReplayedResult string `json:"replayed_result"`
    Changed        bool   `json:"changed"`
}
```

### Snapshot Structure (expected in replay_snapshot)

```json
{
  "policy_state": {
    "daily_limit": 500,
    "max_per_transaction": 100,
    "approval_threshold": 50,
    "allowed_standards": ["x402", "mpp", "l402"],
    "domain_allowlist": ["api.bloomberg.com", "api.reuters.com"]
  },
  "vendor_registry_snapshot": {
    "api.bloomberg.com": {
      "is_blocked": false,
      "success_rate": 0.95
    }
  },
  "agent_context": {
    "spend_today": 340.00,
    "agent_id": "agent-3",
    "task_description": "Researching market data for Q1 report"
  },
  "wallet_manifest": {}
}
```

If `policy_state`, `vendor_registry_snapshot`, or `agent_context` is missing from the snapshot, the endpoint returns 422 with a list of missing fields. No fallback to current data.

---

## Policy Rules

6 rules evaluated in order. A single `block` result means the payment would have been blocked. `flag` means it would have been queued for approval.

| Rule | Check | Block condition |
|---|---|---|
| `daily_limit` | `agent.spend_today + event.amount > policy.daily_limit` | Exceeds daily limit |
| `max_per_transaction` | `event.amount > policy.max_per_transaction` | Single tx too large |
| `domain_allowlist` | `event.domain not in policy.domain_allowlist` | Domain not allowed (only if allowlist is non-empty) |
| `standard_allowlist` | `event.standard not in policy.allowed_standards` | Standard not allowed (only if allowlist is non-empty) |
| `vendor_blocked` | `vendor_snapshot[event.domain].is_blocked == true` | Vendor was blocked at decision time |
| `approval_threshold` | `event.amount > policy.approval_threshold` | Flags for approval (result: "flag", not "block") |

Rules with missing snapshot data return `result: "skipped"`.

---

## Override Application

Overrides patch the snapshot's `policy_state` before evaluation:

```go
func applyOverrides(policy map[string]interface{}, overrides map[string]interface{}) {
    for key, val := range overrides {
        switch v := val.(type) {
        case []interface{}:
            // Array: process add/remove entries
            existing := toStringSlice(policy[key])
            for _, entry := range v {
                s := entry.(string)
                if strings.HasPrefix(s, "-") {
                    existing = removeFromSlice(existing, s[1:])
                } else {
                    existing = append(existing, s)
                }
            }
            policy[key] = existing
        default:
            // Scalar: replace directly
            policy[key] = val
        }
    }
}
```

---

## Convex Query Needed

One new query to fetch the trace with its full snapshot for replay:

```typescript
// convex/traces.ts
export const getForReplay = query({
  args: { trace_id: v.string() },
  handler: async (ctx, args) => {
    const trace = await ctx.db
      .query("payment_traces")
      .withIndex("by_trace_id", q => q.eq("trace_id", args.trace_id))
      .unique();
    if (!trace) return null;

    const event = await ctx.db.get(trace.payment_event_id);
    return { trace, event };
  },
});
```

---

## Error Handling

- Trace not found → 404
- Snapshot missing required fields → 422 with `{"error": "incomplete snapshot", "missing": ["policy_state", "agent_context"]}`
- Invalid policy_overrides (wrong types) → 400
- Convex query failure → 500

---

## What's Not In This Spec

- Path resolver re-run (needs SDK integration — stretch goal)
- Intelligence rule replay (VH-1, SA-1 etc. — different from policy gate checks)
- Batch replay (replay multiple traces at once)
- Replay result storage (results are ephemeral, not persisted)
