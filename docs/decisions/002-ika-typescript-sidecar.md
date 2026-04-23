# ADR-002: Ika integration via TypeScript sidecar service

## Status

Accepted

## Date

2026-04-07

## Context

The Ika dWallet network provides 2PC-MPC signing for cross-chain transactions. Our Go server needs to:

1. Create dWallets (DKG — Distributed Key Generation)
2. Create presign sessions
3. Request signatures (2PC-MPC)
4. Poll for signature completion

The Ika SDK (`@ika.xyz/sdk@0.3.1`) is TypeScript-only, built on `@mysten/sui` (Ika runs on Sui). There is no Go SDK.

## Decision

Create a lightweight TypeScript sidecar service (`apps/ika-sidecar/`) that wraps the Ika SDK and exposes it over HTTP. The Go server calls the sidecar for all Ika operations.

Architecture:

```
Go Server → HTTP → Ika Sidecar (Bun + Hono) → @ika.xyz/sdk → Sui/Ika Network
```

Endpoints: `POST /dkg`, `POST /presign`, `POST /sign`, `GET /signature/:id`

Auth: Shared bearer token via `IKA_SIDECAR_SECRET` env var.

## Alternatives Considered

### Option B: Call Ika REST/RPC API directly from Go

- Pros: No sidecar process, fewer moving parts
- Cons: Ika has no documented REST API — it's a Sui Move-based system accessed through the TypeScript SDK. We'd need to reverse-engineer the Sui transaction building, BCS encoding, and WASM MPC helpers
- Rejected: Months of work to reimplement what the SDK already provides

### Option C: Embed TypeScript in Go via wasm/cgo

- Pros: Single binary
- Cons: Ika SDK depends on Node.js crypto, WASM modules, and Sui transaction builder — not portable to WASM. CGo adds build complexity
- Rejected: Technical infeasibility with the current SDK

### Option D: Rewrite signing pipeline in TypeScript

- Pros: Direct SDK access, no HTTP overhead
- Cons: Rewrites the entire Go server intelligence layer; loses the existing handler/pipeline/model code
- Rejected: Too expensive for hackathon timeline

## Consequences

- Two processes to run in dev/prod (Go server + sidecar)
- ~2-5ms HTTP overhead per sidecar call (negligible vs. 30-90s Ika signing time)
- Sidecar holds the Sui secret key — single point of compromise for all dWallets
- Graceful degradation: if sidecar is not running, MonitorIkaStage passes through
- Performance optimization: presign is created in parallel with Solana on-chain approval, saving ~2-5s on the critical path
