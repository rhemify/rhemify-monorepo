# Rhemos

**Audit-grade autonomy layer for agentic commerce on Solana.**

```
rhemify pay http://service.example/resource
```

One call. **x402 or MPP** detected from the 402 response. Memo-anchored on Solana with the full decision context — agent, policy state, alternatives evaluated, signature — so every payment your agent fleet makes is replayable and verifiable.

## What this is, honestly

The hackathon-judging surface is a CLI + Go intelligence server + Solana Anchor program that demonstrate three things end-to-end:

1. **Detect & pay** an HTTP 402 endpoint over x402 or MPP, signing a memo transaction on Solana devnet that carries the trace context. The signature is the on-chain proof of payment intent.
2. **Capture the full decision** — detection raw body, policy state evaluated, every alternative path scored, rules fired, agent spend context. Stored in Convex and content-hashed.
3. **Replay any decision** with policy overrides. `rhemify traces replay <id> --daily-limit 0` re-runs the original snapshot through the Go replay engine with the new limit and shows you exactly which rules would have flipped. Without changing live state, you answer "what would have happened if our policy was different?" against real captured decisions.

What is NOT in v1 (and the code says so):

- **Real USDC SPL-Token transfers** — shipped + verified live on devnet for both x402 and MPP standards (`x402SolanaTransferExecutor`, `mppChargeTransferExecutor`, each registered ahead of its memo counterpart in the cascade). On a wallet funded with devnet USDC + a real-keypair recipient (set `RECIPIENT_ADDRESS=<pubkey>` on test-402), `rhemify pay` does a real Token::TransferChecked of the USDC amount from payer's ATA to recipient's ATA (creates recipient ATA if missing). On a wallet without a USDC ATA, the transfer executor declines and the cascade falls through to the memo executor, so the demo always succeeds. Real txns verified live: `MdGf3eVLJ7Wdu...` (x402, 0.5 USDC) and `3EKU6waNimeu...` (MPP, 0.1 USDC).
- **L402, AP2, ACP.** Detected and routed correctly, then throw a typed `ProtocolNotImplementedError`. Honest stub, not silent failure.
- **EVM execution.** Two executors registered: `x402EvmTransferExecutor` (phase E — real ERC-20 `transfer(to, amount)` via viem, supports base/base-sepolia/ethereum/ethereum-sepolia) and the legacy `x402EvmExecutor`. Code ships with 9 canExecute tests but live e2e is unproven — requires an EVM private key in `wallet.evmPrivateKey`, ETH for gas, and USDC on the target chain. Demo against the test 402 server falls through cleanly because the default `RECIPIENT_ADDRESS=0x...0001` placeholder is declined at canExecute.
- **CCTP / Jupiter / AgentCard / Squads / Privy** path resolvers all currently return `available: false`. Wiring is in place; execution is not.

The scope guardrails are encoded in `packages/sdk/src/execute/index.ts:28` — `SUPPORTED_PROTOCOLS = ["x402", "mpp"]`. Anything outside that surface throws.

## What actually works end-to-end (verified on devnet)

| Capability | How to verify | Where the proof is |
|---|---|---|
| Full demo, one shot | `./tools/demo-run.sh` | status → pay → show → replay in one invocation |
| Dependency health diagnostic | `rhemify status` | per-service reachability table (Go server / Convex / test-402) |
| x402 detection + Solana memo execution | `rhemify pay http://localhost:3402/stock-data --max-budget '$1.00'` | Solana devnet signature returned, memo log readable on explorer |
| MPP detection + Solana memo execution | `rhemify pay http://localhost:3402/analytics --max-budget '$1.00'` | Solana devnet signature returned |
| Trace ingestion (SDK → Go → Convex) | `rhemify traces list` | Trace shown with non-seeded `trc_<hex>` id |
| Full decision context | `rhemify traces show <trace_id>` | 7 sections: TRACE / EVENT / POLICY / PATH / SNAPSHOT / VERIFIABILITY / NEXT |
| Counterfactual replay | `rhemify traces replay <id> --daily-limit 0` | Original ALLOWED → counterfactual BLOCKED, per-rule diff |
| Merkle anchor + verify | `rhemify traces verify <id>` | Per-trace proof against a shared daily Merkle root on devnet — every trace in the fleet/date VERIFIES against the same on-chain root |
| CI gates on every push | `gh run list --branch feature/siewwwin --limit 1` | TypeScript + Go + Anchor jobs all green |
| On-chain trace anchor | `rhemify traces verify <id>` | `write_daily_root` Anchor program submits Merkle root to devnet |

The CLI is `packages/cli/`. The Go intelligence server (`apps/server/`) runs the rules engine, replay engine, and Convex ingestion shaping. The Anchor program (`programs/rhemify-anchor/`) is deployed to devnet at `HYWjBbLMEz98KnppVkUnHmkUZ4pyQ8abaDRTtUedUkxV`.

## Architecture

```
rhemify CLI
    │
    ├── pay <url>
    │     └── @rhemify-monorepo/sdk: detect → policy → resolve → execute → trace
    │         ├── detect: x402 (status 402 + accepts[]) or MPP (WWW-Authenticate)
    │         ├── policy: 6 rules (daily_limit, max_per_transaction, ...) fetched from
    │         │           Go server /api/policy/<agent>
    │         ├── execute: @solana/web3.js → signed memo tx on devnet
    │         └── emit: POST Go /api/ingest/payment with full trace
    │
    ├── traces list
    │     └── Convex query: payment_traces ordered desc
    │
    ├── traces show <id>
    │     └── Convex query: trace + joined payment_event
    │
    ├── traces replay <id> [overrides]
    │     └── Go /api/traces/<id>/replay
    │         └── apps/server/internal/replay: snake_case policy_state +
    │                                          vendor_snapshot + agent_context
    │
    └── traces verify <id>
          └── Anchor program write_daily_root on devnet
              with user-scoped PDA seeds [b"rhemify-daily", authority, fleet_id, date]
```

Convex schema lives in `packages/backend/convex/schema.ts`. Canonical trace contract in `packages/types/src/intelligence.ts` — keys are snake_case to match the Go replay engine on-wire shape.

## Quickstart (real flow against a local test endpoint)

```bash
# 1. Install
bun install

# 2. Backend services
cd packages/backend && bunx convex dev          # Convex local on :3212
cd apps/server && go run ./cmd/server           # Go server on :8080
cd tools/test-402 && bun run server.ts          # Test 402 on :3402

# 3. Seed the demo fleet into Convex (one-time)
#    Creates a fleet at api_key "rhm_demo_local_fleet_key_2026" with 6 agents.
curl -sS http://127.0.0.1:3212/api/mutation -X POST -H 'Content-Type: application/json' \
  -d '{"path":"seed:demo","args":{},"format":"json"}'

# 4. CLI config (one-time) — uses the seed's known fleet api_key so you don't
#    have to query Convex to find it. Fleet/agent ids are looked up by the
#    api_key on every request, so leaving these placeholder is fine for the
#    demo (the CLI doesn't validate them locally).
mkdir -p ~/.rhemify
cat > ~/.rhemify/config.json <<EOF
{
  "fleetId": "<fleet id from seed:demo response>",
  "fleetName": "demo",
  "agentIds": ["<one agent id — query agents:listAll if needed>"],
  "serverUrl": "http://localhost:8080",
  "convexUrl": "http://127.0.0.1:3212",
  "fleetApiKey": "rhm_demo_local_fleet_key_2026",
  "createdAt": "2026-05-11T00:00:00Z"
}
EOF
solana-keygen new -o ~/.rhemify/wallet.json     # Fund on devnet via faucet.solana.com

# 4. Run the full demo end-to-end (status + pay + show + replay)
./tools/demo-run.sh
# or for the MPP path:
./tools/demo-run.sh http://localhost:3402/analytics

# That's it — `demo-run.sh` is a thin wrapper. The individual commands
# below if you want to invoke them by hand instead:
bun packages/cli/src/index.ts status
bun packages/cli/src/index.ts pay http://localhost:3402/stock-data --max-budget '$1.00'
bun packages/cli/src/index.ts traces list
bun packages/cli/src/index.ts traces show <trace_id>
bun packages/cli/src/index.ts traces replay <trace_id> --daily-limit 0
bun packages/cli/src/index.ts traces verify <trace_id>   # cryptographic Merkle anchor on devnet
```

## Tech stack (what's actually used)

| Layer | Technology |
|---|---|
| Solana payment execution | `@solana/web3.js` directly (SPL Memo program) |
| Solana anchor program | Anchor framework, devnet deployed |
| Intelligence server | Go 1.22, gin |
| Replay engine | Go (`apps/server/internal/replay/`) |
| Rules engine | Go (7 rules: VH-1, VH-2, SA-1/2/3, RO-1, SUB-1) |
| Trace storage | Convex (anonymous local for dev) |
| CLI | TypeScript + Bun |
| Frontend (dashboard, separate scope) | TanStack Start, Tailwind 4, shadcn/ui |
| Auth (not active in v1 flow) | Better-Auth |

The SDK does NOT use `x402-solana`, `x402-fetch`, `@solana/mpp`, `mppx`, or `@solana/kit` in the actually-tested code path. Those were declared as peer deps but their facilitator-shaped APIs never matched any real endpoint we ran against. The execute path is intentionally self-contained on `@solana/web3.js` so the demo runs without network surprises.

## Project structure

```
rhemify-monorepo/
├── apps/
│   ├── web/              # TanStack Start fullstack — marketing, onboarding, dashboard
│   ├── server/           # Go intelligence server (rules, replay, anchoring, ingestion)
│   ├── tui/              # OpenTUI terminal dashboard streaming Convex
│   └── ika-sidecar/      # Ika dWallet 2PC-MPC sidecar (out of v1 demo scope)
├── packages/
│   ├── sdk/              # @rhemify-monorepo/sdk — the 6-stage payment pipeline
│   ├── cli/              # rhemify CLI (pay, traces, onboard, status)
│   ├── backend/          # Convex schema + queries/mutations
│   ├── types/            # Canonical SDK ↔ Go contract types
│   ├── ui/               # shadcn/ui + brand tokens
│   ├── mcp/              # MCP server (rhemify-mcp)
│   ├── db/               # Drizzle/Turso (auth side)
│   ├── auth/             # Better-Auth config
│   ├── env/              # Zod-validated env
│   └── config/           # Shared tsconfig
├── programs/
│   ├── rhemify-anchor/   # Anchor program — write_daily_root (Merkle anchor)
│   └── rhemify-dwallet/  # Anchor program — fleet vault + agent wallet PDAs
├── tools/
│   ├── test-402/         # Local x402+MPP test server for SDK e2e
│   └── devnet-smoke/     # Anchor program devnet smoke tests
└── docs/                 # Specs, positioning, research (local only)
```

## Roadmap (NOT in v1)

These items would graduate Rhemos from "audit-grade autonomy layer" to "production payment rail":

- **Real USDC SPL-Token transfers** — x402SolanaTransferExecutor (shipped, see "What is NOT in v1" for the caveats). mppChargeTransferExecutor (not started — same pattern as the x402 transfer executor, would slot in ahead of mppChargeExecutor in the cascade).
- **Mainnet anchoring** — write_daily_root parameterized for mainnet, multisig upgrade authority via Squads.
- **L402, AP2, ACP execution** — Today they detect cleanly and throw a typed error. Adding execution is per-protocol work, not pipeline work.
- **EVM execution path (live proof)** — x402EvmTransferExecutor ships (phase E). To activate, set `wallet.evmPrivateKey` in CLI config, fund the EVM address with Base Sepolia ETH (faucet) + Base Sepolia USDC (faucet.circle.com), restart test-402 with `RECIPIENT_ADDRESS=<real_0x...>`, run `rhemify pay http://localhost:3402/weather`. CLI doesn't yet read an EVM keystore — that's the last CLI integration step.
- **CCTP cross-chain** — Wiring stub exists; needs real Solana↔Base CCTP integration.
- **Ika dWallet 2PC-MPC signing** — Sidecar boots cleanly. `/sign` returns 501 Not Implemented with an explicit `scope_status: "v1_scoped_out"` payload (see `apps/ika-sidecar/src/index.ts`). The 0.3.1 SDK signing surface needs live Ika test network access to verify — staged for a future "MPC-controlled fleet treasury" feature.
- **Shared dev Convex deployment** — Current demo uses local anonymous Convex. Migrating to a shared dev deployment requires coordinated schema rollout.
- **CI/CD on GH Actions** — `tsc + cargo check + go test` on push. (shipped — `.github/workflows/ci.yml`)
- **Per-trace Merkle anchoring** — (shipped) Go server builds a binary Merkle tree over the day's traces and returns per-trace proofs from `/api/anchor/<fleet>/<date>/merkle-proof?trace_id=X`. `rhemify traces verify` recomputes the root from leaf+path locally, then anchors / verifies against the on-chain PDA. Multiple traces in the same fleet+date now all VERIFY against one shared root. See `apps/server/internal/merkle/` for the tree + 10 unit tests.

## Team (Colosseum Frontier hackathon)

- **Sean** — payment runtime (SDK pipeline, detector, policy, OWS, path resolver)
- **Zhe Hong** — intelligence layer (Go backend, rules engine, replay)
- **Wei Hup (Aaron)** — external integrations (AgentCard, Jupiter, CCTP, onboarding CLI)
- **Jun Shen** — frontend (dashboard, onboarding, trace viewer, replay UI)
- **siewwwin** — AI/prompt engineering; SDK ↔ Convex contract reconciliation; decision-replay CLI

## License

Private — Colosseum Frontier hackathon submission (Apr 6 — May 11, 2026).
