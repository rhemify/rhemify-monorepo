# Decision Replay Engine — Implementation Plan (RHE-24)

**Spec:** `docs/superpowers/specs/2026-04-15-replay-engine-design.md`
**Goal:** `POST /api/traces/:id/replay` — forensic replay of payment decisions with counterfactual policy overrides.

## Dependency Graph

```
Task 1: Convex getForReplay query
   ↓
Task 2: replay/policy.go (6 rules + override application)
   ↓
Task 3: replay/diff.go + replay/replay.go (orchestrator)
   ↓
Task 4: handler/replay.go + router wiring
   ↓
Task 5: Smoke test end-to-end
```

Tasks 1 and 2 are independent (Convex vs Go). Tasks 3-5 are sequential.

## File Map

| File                                         | Action | Responsibility                                                        |
| -------------------------------------------- | ------ | --------------------------------------------------------------------- |
| `convex/traces.ts`                           | Modify | Add `getForReplay` query                                              |
| `apps/server/internal/replay/policy.go`      | Create | PolicyEvaluator: 6 rules + applyOverrides                             |
| `apps/server/internal/replay/policy_test.go` | Create | Table-driven tests for all 6 rules + overrides                        |
| `apps/server/internal/replay/diff.go`        | Create | ComputeDiff between original and replayed outcomes                    |
| `apps/server/internal/replay/replay.go`      | Create | ReplayEngine: types, snapshot validation, orchestration               |
| `apps/server/internal/replay/replay_test.go` | Create | Integration tests: full replay with overrides, missing snapshot, diff |
| `apps/server/internal/handler/replay.go`     | Create | HTTP handler for POST /api/traces/:id/replay                          |
| `apps/server/internal/router/router.go`      | Modify | Register replay endpoint under SDK auth                               |

---

## Task 1: Convex getForReplay Query

**Files:** `convex/traces.ts`

**What:** Add a query that fetches a trace by `trace_id` (string, not Convex \_id) with its linked payment event. The Go server uses trace_id strings, not Convex document IDs.

**Acceptance Criteria:**

- Query accepts `trace_id: string`
- Returns `{ trace, event }` or `null`
- Uses `by_trace_id` index (already exists)
- Deploy succeeds

**Verification:**

```bash
bunx convex dev --once
```

---

## Task 2: Policy Evaluator + Tests

**Files:** `apps/server/internal/replay/policy.go`, `apps/server/internal/replay/policy_test.go`

**What:** Pure function that evaluates 6 policy rules against snapshot data. No Convex dependency — takes extracted maps as input.

**Functions:**

- `EvaluatePolicy(event, policyState, vendorSnapshot, agentContext) PolicyOutcome`
- `applyOverrides(policyState, overrides) map[string]interface{}`
- Helper: `toStringSlice`, `removeFromSlice`

**6 Rules:**

1. `daily_limit` — `agent.spend_today + event.amount > policy.daily_limit` → block
2. `max_per_transaction` — `event.amount > policy.max_per_transaction` → block
3. `domain_allowlist` — `event.domain not in allowlist` → block (skip if allowlist empty)
4. `standard_allowlist` — `event.standard not in allowlist` → block (skip if allowlist empty)
5. `vendor_blocked` — `vendor[domain].is_blocked == true` → block
6. `approval_threshold` — `event.amount > policy.approval_threshold` → flag (not block)

Rules with missing data → `result: "skipped"`.

**Acceptance Criteria:**

- Each rule tested with: fires, doesn't fire, boundary, missing data → skipped
- Override tests: scalar replace, array add, array remove with `-` prefix
- Empty allowlists skip check (don't block everything)
- `PolicyOutcome.Allowed` is false if any rule returns "block"

**Verification:**

```bash
cd apps/server && go test ./internal/replay/... -run TestEvaluate -v
cd apps/server && go test ./internal/replay/... -run TestApplyOverrides -v
```

---

## Task 3: Diff + Replay Orchestrator

**Files:** `apps/server/internal/replay/diff.go`, `apps/server/internal/replay/replay.go`, `apps/server/internal/replay/replay_test.go`

**What:**

- `diff.go` — `ComputeDiff(original, replayed PolicyOutcome) []PolicyDiff` — compares rule-by-rule, returns only changed rules
- `replay.go` — Types (ReplayRequest, ReplayResult, etc.) + `ReplayEngine` struct with `Replay(traceData, eventData, overrides) (*ReplayResult, error)`

**ReplayEngine.Replay flow:**

1. Extract `replay_snapshot` from trace data
2. Validate snapshot completeness (policy_state, vendor_registry_snapshot, agent_context must exist)
3. Build original `PolicyOutcome` from `trace.policy_rules_fired`
4. Deep-copy `policy_state`, apply overrides
5. Call `EvaluatePolicy` with overridden policy
6. Call `ComputeDiff`
7. Return `ReplayResult`

**Acceptance Criteria:**

- Missing snapshot → returns error with list of missing fields
- With overrides: diff shows changed rules
- Without overrides: replayed matches original, diff is empty
- `CounterfactualBlocked` = true when any replayed rule returns "block"

**Verification:**

```bash
cd apps/server && go test ./internal/replay/... -v
```

---

## Checkpoint: All replay logic tested without HTTP

At this point, `internal/replay/` is complete and tested as a pure Go package. No Convex or HTTP dependencies in tests. 56 engine tests + new replay tests all pass.

```bash
cd apps/server && go test ./internal/replay/... ./internal/engine/... -v
```

---

## Task 4: HTTP Handler + Router

**Files:** `apps/server/internal/handler/replay.go`, `apps/server/internal/router/router.go`

**What:**

- `handler/replay.go` — `ReplayHandler` with Convex client. `HandleReplay` method:
  1. Parse trace_id from URL param
  2. Parse optional `ReplayRequest` body
  3. Fetch trace+event from Convex via `traces:getForReplay`
  4. Call `replay.ReplayEngine.Replay()`
  5. Return result as JSON (200, 404, 422, 400)
- `router.go` — Register `sdk.POST("/traces/:id/replay", replayHandler.HandleReplay)` under SDK auth group

**Acceptance Criteria:**

- Route registered under SDK auth (requires fleet API key)
- 404 when trace not found
- 422 when snapshot incomplete (includes missing fields list)
- 400 when overrides have wrong types
- 200 with full ReplayResult on success
- Server builds cleanly

**Verification:**

```bash
cd apps/server && go build ./internal/...
```

---

## Task 5: Smoke Test + Commit

**What:** End-to-end verification with curl, then commit everything.

**Verification (manual, requires Convex dev + Go server running):**

```bash
# Replay with no overrides (should match original)
curl -s -X POST http://localhost:8080/api/traces/trc_test/replay \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" | jq .

# Replay with daily_limit override
curl -s -X POST http://localhost:8080/api/traces/trc_test/replay \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{"policy_overrides": {"daily_limit": 50}}' | jq .
```

**Commit strategy:**

```bash
git add convex/traces.ts
git commit -m "feat(convex): add getForReplay query for replay engine"

git add apps/server/internal/replay/ apps/server/internal/handler/replay.go apps/server/internal/router/router.go
git commit -m "feat(replay): implement decision replay engine with counterfactual analysis (RHE-24)"
```

**Final verification:**

```bash
cd apps/server && make test
```
