# RHE-24: Decision Replay Engine — Task List

- [ ] **Task 1:** Convex `getForReplay` query (`convex/traces.ts`)
- [ ] **Task 2:** Policy evaluator + override application + tests (`replay/policy.go`)
- [ ] **Task 3:** Diff computation + replay orchestrator + tests (`replay/diff.go`, `replay/replay.go`)
- [ ] **Checkpoint:** All replay logic tested without HTTP — `go test ./internal/replay/... -v`
- [ ] **Task 4:** HTTP handler + router wiring (`handler/replay.go`, `router/router.go`)
- [ ] **Task 5:** Smoke test end-to-end + commit + push
