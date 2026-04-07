# ADR-003: 7-stage signing pipeline with chain-of-responsibility pattern

## Status
Accepted

## Date
2026-04-07

## Context
When an agent requests a cross-chain payment via `POST /api/signing/request`, the system must:
1. Validate the request
2. Check policy limits (per-tx, daily)
3. Run intelligence rules (anomaly detection)
4. Approve on Solana (on-chain policy enforcement)
5. Get Ika 2PC-MPC signature
6. Broadcast to target chain (Base, Ethereum, etc.)
7. Record the payment event and trace

This spans 3 networks (Convex, Solana, target EVM chain) plus the Ika MPC network. Total latency: 35-100 seconds. Failures can occur at any stage.

## Decision
Implement a chain-of-responsibility pipeline with 7 stages:

```
Validate → PolicyCheck → Intelligence → ApproveOnChain → MonitorIka → Broadcast → Settlement
```

Each stage implements `SigningStage` interface:
```go
type SigningStage interface {
    Name() string
    Execute(ctx context.Context, sc *SigningContext) error
}
```

Key behaviors:
- **Short-circuit on rejection**: If any stage sets `sc.Rejection`, pipeline stops (not an error)
- **Short-circuit on error**: If any stage returns error, pipeline stops with failure
- **Async execution**: Pipeline runs in a goroutine per request, capped at 20 concurrent
- **Status updates**: Each stage updates Convex as it progresses

Performance optimization: ApproveOnChainStage kicks off Ika presign creation in parallel with the Solana transaction, saving ~2-5s.

## Alternatives Considered

### Event-driven (message queue)
- Pros: Better failure recovery, can retry individual stages
- Cons: Adds Kafka/NATS dependency, complicates local dev, overkill for 4-person hackathon team
- Rejected: Pipeline pattern is sufficient; can migrate to event-driven later if needed

### Single monolithic handler
- Pros: Simpler, fewer abstractions
- Cons: Can't test stages independently, can't short-circuit, hard to add/reorder stages
- Rejected: We need independent testability and the ability to stub stages (Ika, Solana)

## Consequences
- Each stage is independently testable with mock dependencies
- Stages can be stubbed (e.g., MonitorIkaStage passes through when sidecar is down)
- Pipeline is easy to extend (add stages) or reorder
- 20-goroutine cap prevents DoS from unbounded signing requests
- Pipeline runs async — caller gets request ID immediately, polls for status
