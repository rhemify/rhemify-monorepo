# Implementation Plan: Ika dWallet Integration

**Spec:** `docs/superpowers/specs/2026-04-07-ika-encrypt-integration-design.md`
**Deadline:** May 12, 2026 (hackathon)
**Strategy:** Risk-first — prove Ika SDK + solana-go work before building the full pipeline

## Architecture Decisions

- **solana-go as local module**: Use `replace` directive in `apps/server/go.mod` to point at `../../solana-go`. Avoids version mismatch issues with the cloned repo.
- **anchor-go NOT used**: We hand-build instruction data using Borsh encoding + Anchor discriminators. Simpler than code-gen for 4 instructions.
- **Vertical slices**: Each phase delivers something testable end-to-end.
- **Go server module stays `github.com/rhemify/server`**: No rename needed.

## Task List

---

### Phase 1: Foundation — solana-go Integration + Models (Risk Spike)

#### Task 1: Wire solana-go as local dependency in Go server

**Description:** Add solana-go as a `replace` directive in the Go server's `go.mod` so we can import it. Verify it compiles.

**Acceptance criteria:**
- [ ] `apps/server/go.mod` has `require github.com/gagliardetto/solana-go` and `replace github.com/gagliardetto/solana-go => ../../solana-go`
- [ ] `go mod tidy` succeeds in `apps/server/`
- [ ] A simple test file that imports `solana-go` and creates a `PublicKey` compiles

**Verification:**
- [ ] `cd apps/server && go build ./...` succeeds
- [ ] `go vet ./...` passes

**Dependencies:** None

**Files likely touched:**
- `apps/server/go.mod`
- `apps/server/go.sum`

**Estimated scope:** XS

---

#### Task 2: Add new config fields for Solana + co-signer

**Description:** Extend `config.Config` with Solana RPC URL, co-signer private key, and rhemify-dwallet program ID. Load from env vars.

**Acceptance criteria:**
- [ ] `Config` struct has `SolanaRPCURL`, `CosignerPrivateKey`, `DWalletProgramID` fields
- [ ] Loaded from `SOLANA_RPC_URL`, `COSIGNER_PRIVATE_KEY`, `DWALLET_PROGRAM_ID` env vars
- [ ] Sensible defaults: `SOLANA_RPC_URL` defaults to devnet

**Verification:**
- [ ] `go build ./...` succeeds
- [ ] No existing tests broken

**Dependencies:** None

**Files likely touched:**
- `apps/server/internal/config/config.go`

**Estimated scope:** XS

---

#### Task 3: Add new data models (DWallet, SigningRequest, WalletBalance)

**Description:** Create model structs matching the Convex schema extensions from the spec. Follow existing model patterns (json tags, snake_case).

**Acceptance criteria:**
- [ ] `model.DWallet` struct with all fields from `dwallet_registry` schema
- [ ] `model.SigningRequest` struct with all fields from `signing_requests` schema
- [ ] `model.WalletBalance` struct with all fields from `wallet_balances` schema
- [ ] All structs have proper `json:"snake_case"` tags

**Verification:**
- [ ] `go build ./...` succeeds
- [ ] Structs match schema in spec Section 2

**Dependencies:** None

**Files likely touched:**
- `apps/server/internal/model/dwallet.go` (new)
- `apps/server/internal/model/signing_request.go` (new)
- `apps/server/internal/model/wallet_balance.go` (new)

**Estimated scope:** S

---

#### Task 4: Add state machine for dWallet and signing request lifecycle

**Description:** Implement the state machine pattern from spec Section 6. Explicit valid transitions, error on invalid ones.

**Acceptance criteria:**
- [ ] `ValidateDWalletTransition(from, to string) error` function
- [ ] `ValidateSigningTransition(from, to string) error` function
- [ ] Valid transitions match spec: dWallet (creating->active->frozen->active, ->revoked) and signing (pending->approved->signed->broadcast->confirmed, pending->rejected, *->failed)
- [ ] Unit tests for both valid and invalid transitions

**Verification:**
- [ ] `go test ./internal/model/...` passes
- [ ] Tests cover all valid transitions and at least 3 invalid ones

**Dependencies:** None

**Files likely touched:**
- `apps/server/internal/model/state.go` (new)
- `apps/server/internal/model/state_test.go` (new)

**Estimated scope:** S

---

### Checkpoint: Phase 1
- [ ] `cd apps/server && go build ./...` succeeds
- [ ] `go test ./...` passes
- [ ] solana-go imports work
- [ ] All models exist and match spec

---

### Phase 2: Solana Transaction Builder (Co-signer Core)

#### Task 5: Create Solana client wrapper

**Description:** Thin wrapper around solana-go's RPC client that the server initializes once. Handles connection, provides typed methods for our use cases.

**Acceptance criteria:**
- [ ] `internal/solana/client.go` with `SolanaClient` struct wrapping `rpc.Client`
- [ ] Constructor `NewSolanaClient(rpcURL string) *SolanaClient`
- [ ] Method `GetLatestBlockhash(ctx) (solana.Hash, error)`
- [ ] Method `SendAndConfirmTx(ctx, tx) (solana.Signature, error)` — sends tx, polls for confirmation
- [ ] Method `GetAccountInfo(ctx, pubkey) (*rpc.GetAccountInfoResult, error)`

**Verification:**
- [ ] `go build ./...` succeeds
- [ ] Integration test that connects to devnet and fetches a blockhash (skipped in CI)

**Dependencies:** Task 1

**Files likely touched:**
- `apps/server/internal/solana/client.go` (new)

**Estimated scope:** S

---

#### Task 6: Implement Anchor instruction builder for rhemify-dwallet

**Description:** Build the 4 instruction data encoders for `rhemify-dwallet`: `initialize_fleet_vault`, `register_agent_wallet`, `approve_signing`, `freeze_agent`. Uses Borsh encoding with Anchor 8-byte discriminators.

**Acceptance criteria:**
- [ ] `internal/solana/instructions.go` with builder functions for each instruction
- [ ] Each function returns `solana.Instruction` (implements ProgramID, Accounts, Data interface)
- [ ] Anchor discriminator computed as first 8 bytes of SHA256("global:instruction_name")
- [ ] PDA derivation helpers: `FleetVaultPDA(programID, fleetID)`, `AgentWalletPDA(programID, fleetID, agentKey)`, `SigningApprovalPDA(programID, agentWallet, nonce)`
- [ ] Unit tests verify instruction data encoding matches expected bytes

**Verification:**
- [ ] `go test ./internal/solana/...` passes
- [ ] PDA derivation produces deterministic addresses

**Dependencies:** Task 1, Task 5

**Files likely touched:**
- `apps/server/internal/solana/instructions.go` (new)
- `apps/server/internal/solana/instructions_test.go` (new)
- `apps/server/internal/solana/pda.go` (new)

**Estimated scope:** M

---

#### Task 7: Implement co-signer transaction submitter

**Description:** The `cosigner` package loads the co-signer private key, builds transactions using the instruction builders, signs them, and sends them via the Solana client.

**Acceptance criteria:**
- [ ] `internal/signer/cosigner.go` with `Cosigner` struct
- [ ] Constructor `NewCosigner(solClient *solana.SolanaClient, privateKey solana.PrivateKey, programID solana.PublicKey)`
- [ ] Method `ApproveSigning(ctx, agentWallet PublicKey, fleetVault PublicKey, targetChain, targetAddress string, amount uint64, nonce string) (solana.Signature, error)`
- [ ] Method `FreezeAgent(ctx, fleetVault PublicKey, fleetID, agentKey string) (solana.Signature, error)`
- [ ] Builds tx with latest blockhash, signs with co-signer key, sends via client

**Verification:**
- [ ] `go build ./...` succeeds
- [ ] Unit test with mocked Solana client verifies correct instruction data is built

**Dependencies:** Task 5, Task 6

**Files likely touched:**
- `apps/server/internal/signer/cosigner.go` (new)
- `apps/server/internal/signer/cosigner_test.go` (new)

**Estimated scope:** M

---

### Checkpoint: Phase 2
- [ ] `go build ./...` and `go test ./...` pass
- [ ] Can build, sign, and (mock) send an `approve_signing` transaction
- [ ] PDA derivation is deterministic and tested

---

### Phase 3: Chain Adapter + Signing Pipeline

#### Task 8: Implement ChainAdapter interface and Base adapter

**Description:** Create the chain adapter abstraction and the Base (Sepolia) implementation for balance queries and tx broadcasting.

**Acceptance criteria:**
- [ ] `internal/chain/adapter.go` with `ChainAdapter` interface (Chain, GetBalance, Broadcast, IsConfirmed)
- [ ] `internal/chain/registry.go` with `ChainRegistry` struct and `Get(chain string)` method
- [ ] `internal/chain/base.go` with `BaseAdapter` implementing the interface using JSON-RPC calls to Base Sepolia
- [ ] Registry initialized with Base adapter in constructor

**Verification:**
- [ ] `go build ./...` succeeds
- [ ] Unit test that `registry.Get("base")` returns BaseAdapter
- [ ] Unit test that `registry.Get("unknown")` returns error

**Dependencies:** None (independent of Solana work)

**Files likely touched:**
- `apps/server/internal/chain/adapter.go` (new)
- `apps/server/internal/chain/registry.go` (new)
- `apps/server/internal/chain/base.go` (new)
- `apps/server/internal/chain/base_test.go` (new)

**Estimated scope:** M

---

#### Task 9: Implement signing pipeline (chain of responsibility)

**Description:** Build the 7-stage signing pipeline from spec Section 6. Each stage is a `SigningStage` interface implementation. Pipeline short-circuits on rejection or error.

**Acceptance criteria:**
- [ ] `internal/signer/pipeline.go` with `SigningPipeline` and `SigningContext` structs
- [ ] `SigningStage` interface with `Name() string` and `Execute(ctx, *SigningContext) error`
- [ ] 7 stage implementations: ValidateStage, PolicyCheckStage, IntelligenceStage, ApproveOnChainStage, MonitorIkaStage, BroadcastStage, SettlementStage
- [ ] Pipeline stops on first error or rejection (Rejection field set)
- [ ] Each stage logs its name and outcome

**Verification:**
- [ ] `go test ./internal/signer/...` passes
- [ ] Test: pipeline with mock stages that all pass -> reaches SettlementStage
- [ ] Test: pipeline with stage 3 rejecting -> stops at stage 3, later stages not called

**Dependencies:** Task 7, Task 8

**Files likely touched:**
- `apps/server/internal/signer/pipeline.go` (new)
- `apps/server/internal/signer/stages.go` (new)
- `apps/server/internal/signer/pipeline_test.go` (new)

**Estimated scope:** M

---

### Checkpoint: Phase 3
- [ ] Full signing pipeline compiles and tests pass
- [ ] Chain adapter abstraction works
- [ ] Pipeline short-circuits correctly on rejection

---

### Phase 4: API Handlers + Router

#### Task 10: Implement wallet handler (dWallet CRUD + balances)

**Description:** HTTP handler for dWallet management endpoints. Follows existing handler patterns (struct with convex client, Gin handlers, gin.H errors).

**Acceptance criteria:**
- [ ] `internal/handler/wallets.go` with `WalletHandler` struct
- [ ] Endpoints: `POST /api/wallets/create-fleet`, `POST /api/wallets/create-agent`, `GET /api/wallets/:fleetId`, `GET /api/wallets/:fleetId/:agentKey`, `POST /api/wallets/freeze/:agentKey`
- [ ] create-fleet: validates payload, calls Convex mutation to insert dwallet_registry, calls cosigner to submit initialize_fleet_vault tx
- [ ] create-agent: validates payload, calls Convex mutation, calls cosigner to submit register_agent_wallet tx
- [ ] freeze: calls cosigner to submit freeze_agent tx, updates Convex status
- [ ] GET endpoints: query Convex for dwallet_registry + wallet_balances

**Verification:**
- [ ] `go build ./...` succeeds
- [ ] Handler follows existing patterns (constructor, gin.H errors, json tags)

**Dependencies:** Task 3, Task 7

**Files likely touched:**
- `apps/server/internal/handler/wallets.go` (new)

**Estimated scope:** M

---

#### Task 11: Implement signing handler

**Description:** HTTP handler for signing request endpoints. Receives signing requests from the agent SDK and kicks off the pipeline.

**Acceptance criteria:**
- [ ] `internal/handler/signing.go` with `SigningHandler` struct
- [ ] Endpoints: `POST /api/signing/request`, `GET /api/signing/:id`
- [ ] POST: validates payload (agent_key, target_chain, target_address, token, amount), creates signing_request in Convex with status "pending", runs pipeline async, returns request ID
- [ ] GET: queries Convex for signing request by ID, returns current status
- [ ] Pipeline runs in a goroutine; status updates written to Convex as pipeline progresses

**Verification:**
- [ ] `go build ./...` succeeds
- [ ] Handler follows existing patterns

**Dependencies:** Task 3, Task 9

**Files likely touched:**
- `apps/server/internal/handler/signing.go` (new)

**Estimated scope:** M

---

#### Task 12: Wire new handlers into router + server startup

**Description:** Register the new handlers in the router, initialize all new dependencies (Solana client, cosigner, chain registry, pipeline) in `main.go`.

**Acceptance criteria:**
- [ ] `router.Setup` accepts new dependencies (or a deps struct) and registers wallet + signing routes
- [ ] `main.go` initializes: SolanaClient, Cosigner (from config), ChainRegistry (with Base), SigningPipeline (with all stages)
- [ ] Wallet endpoints under SDK auth middleware (same as existing ingest/policy)
- [ ] Signing endpoints under SDK auth middleware
- [ ] Server starts successfully with all new routes

**Verification:**
- [ ] `go build ./...` succeeds
- [ ] `go run ./cmd/server` starts without panic (with valid env vars)
- [ ] `curl /api/health` still returns 200

**Dependencies:** Task 10, Task 11

**Files likely touched:**
- `apps/server/internal/router/router.go`
- `apps/server/cmd/server/main.go`

**Estimated scope:** S

---

### Checkpoint: Phase 4
- [ ] `go build ./...` and `go test ./...` pass
- [ ] Server starts with new routes
- [ ] `curl POST /api/wallets/create-fleet` returns a response (even if Convex/Solana aren't configured)
- [ ] Existing endpoints unaffected

---

### Phase 5: Convex Schema + Backend Functions

#### Task 13: Add Convex schema tables

**Description:** Add the 3 new tables to `convex/schema.ts` matching the spec.

**Acceptance criteria:**
- [ ] `dwallet_registry` table with all fields and indexes from spec
- [ ] `wallet_balances` table with all fields and indexes from spec
- [ ] `signing_requests` table with all fields and indexes from spec
- [ ] `agents` table gets `dwallet_id: v.optional(v.string())` field
- [ ] `bunx convex dev` accepts the schema (no validation errors)

**Verification:**
- [ ] Schema matches spec Section 2 exactly
- [ ] `bun run check-types` passes

**Dependencies:** None (independent of Go work)

**Files likely touched:**
- `convex/schema.ts`

**Estimated scope:** S

---

#### Task 14: Add Convex query/mutation functions for dWallets

**Description:** CRUD functions in Convex for the new tables. The Go server calls these via HTTP.

**Acceptance criteria:**
- [ ] `convex/dwallets.ts`: mutations `insert`, `updateStatus`; queries `getByFleet`, `getByAgent`, `getByDwalletId`
- [ ] `convex/walletBalances.ts`: mutations `upsert`; queries `getByDwallet`
- [ ] `convex/signingRequests.ts`: mutations `insert`, `updateStatus`; queries `getById`, `getByFleet`, `getByAgent`
- [ ] All functions follow existing Convex patterns (check `convex/_generated/ai/guidelines.md` first)

**Verification:**
- [ ] `bunx convex dev` deploys without errors
- [ ] `bun run check-types` passes

**Dependencies:** Task 13

**Files likely touched:**
- `convex/dwallets.ts` (new)
- `convex/walletBalances.ts` (new)
- `convex/signingRequests.ts` (new)

**Estimated scope:** M

---

### Checkpoint: Phase 5
- [ ] Convex schema deployed
- [ ] Go server can call Convex functions for new tables
- [ ] End-to-end: Go handler -> Convex mutation -> data persisted

---

### Phase 6: Anchor Program — rhemify-dwallet

#### Task 15: Scaffold rhemify-dwallet Anchor program

**Description:** Create the new Anchor program with account state structs and 4 instruction stubs.

**Acceptance criteria:**
- [ ] `programs/rhemify-dwallet/` with Anchor project structure
- [ ] Account structs: `FleetVault`, `AgentWallet`, `SigningApproval` matching spec Section 3 (plaintext u64 fields)
- [ ] 4 instruction stubs that compile but have no logic
- [ ] PDA seeds match spec: `[b"fleet-vault", fleet_id]`, `[b"agent-wallet", fleet_id, agent_key]`, `[b"signing-approval", agent_wallet, nonce]`
- [ ] `anchor build` succeeds

**Verification:**
- [ ] `cd programs/rhemify-dwallet && anchor build` succeeds
- [ ] Program ID generated

**Dependencies:** None (independent of Go work)

**Files likely touched:**
- `programs/rhemify-dwallet/Cargo.toml` (new)
- `programs/rhemify-dwallet/Anchor.toml` (new)
- `programs/rhemify-dwallet/src/lib.rs` (new)
- `programs/rhemify-dwallet/src/state/` (new)
- `programs/rhemify-dwallet/src/instructions/` (new)

**Estimated scope:** M

---

#### Task 16: Implement rhemify-dwallet instruction logic

**Description:** Fill in the 4 instructions with actual logic: initialization, registration, approval with policy checks, and freeze.

**Acceptance criteria:**
- [ ] `initialize_fleet_vault`: creates FleetVault PDA, sets authority, co_signer, daily_cap
- [ ] `register_agent_wallet`: creates AgentWallet PDA, links to FleetVault, sets limits
- [ ] `approve_signing`: checks status==active, is_frozen==false, amount<=max_per_tx, daily_spent+amount<=daily_limit, resets daily_spent on date change, creates SigningApproval PDA
- [ ] `freeze_agent`: sets AgentWallet.status=frozen, requires authority signer
- [ ] `anchor build` succeeds
- [ ] `anchor test` passes with basic happy-path tests

**Verification:**
- [ ] `anchor build` succeeds
- [ ] `anchor test` passes (Anchor's built-in test framework)
- [ ] Policy check rejects over-limit amounts

**Dependencies:** Task 15

**Files likely touched:**
- `programs/rhemify-dwallet/src/instructions/*.rs`
- `programs/rhemify-dwallet/tests/` (new)

**Estimated scope:** L (break into sub-tasks if needed)

---

#### Task 17: Deploy rhemify-dwallet to devnet + update Go server program ID

**Description:** Deploy the program to Solana devnet. Update Go server config and PDA derivation with the actual program ID.

**Acceptance criteria:**
- [ ] Program deployed to Solana devnet
- [ ] Program ID recorded in Go server's `.env.example`
- [ ] Go server's PDA derivation uses the real program ID
- [ ] Go server can successfully submit an `initialize_fleet_vault` tx to devnet

**Verification:**
- [ ] `solana program show <program-id>` on devnet returns program info
- [ ] Go server integration test creates a fleet vault on devnet

**Dependencies:** Task 16, Task 7

**Files likely touched:**
- `programs/rhemify-dwallet/Anchor.toml`
- `apps/server/.env.example`
- `apps/server/internal/config/config.go`

**Estimated scope:** S

---

### Checkpoint: Phase 6
- [ ] rhemify-dwallet deployed to devnet
- [ ] Go server can submit all 4 instruction types
- [ ] Policy checks work on-chain (over-limit tx rejected)

---

### Phase 7: Frontend — Dashboard Wallets Page

#### Task 18: Add frontend types and WalletService interface

**Description:** Add the new TypeScript types (DWallet, Chain, WalletBalance, SigningRequest) and the WalletService interface.

**Acceptance criteria:**
- [ ] Types added to `apps/web/src/lib/types.ts` matching spec Section 5
- [ ] `WalletService` interface in `apps/web/src/lib/services/wallet-service.ts`
- [ ] `MockWalletService` implementation with realistic mock data
- [ ] Type checking passes

**Verification:**
- [ ] `bun run check-types` passes

**Dependencies:** None (independent of backend)

**Files likely touched:**
- `apps/web/src/lib/types.ts`
- `apps/web/src/lib/services/wallet-service.ts` (new)
- `apps/web/src/lib/services/mock-wallet-service.ts` (new)

**Estimated scope:** S

---

#### Task 19: Build the wallets dashboard page

**Description:** Implement the `/dashboard/wallets` page with fleet treasury, agent wallets, and signing requests table. Uses MockWalletService.

**Acceptance criteria:**
- [ ] Fleet treasury section showing balances per chain
- [ ] Agent wallets list with status badges, chain balances, daily spend progress bars
- [ ] Signing requests table with status, chain, amount, time
- [ ] Freeze/unfreeze toggle per agent
- [ ] Dark theme, DM Mono for amounts, brand tokens for colors
- [ ] Responsive layout

**Verification:**
- [ ] `bun run dev:web` shows the page at `/dashboard/wallets`
- [ ] `bun run check-types` passes
- [ ] `bun run check` (lint + format) passes

**Dependencies:** Task 18

**Files likely touched:**
- `apps/web/src/routes/dashboard/wallets/` (new or replace existing "coming soon")
- Component files for treasury card, agent wallet card, signing request row

**Estimated scope:** M-L

---

### Checkpoint: Phase 7
- [ ] Dashboard wallets page renders with mock data
- [ ] All frontend checks pass
- [ ] Visual review matches spec wireframe

---

### Phase 8: Balance Syncing + End-to-End Integration

#### Task 20: Implement balance sync goroutine

**Description:** Background goroutine in the Go server that syncs cross-chain balances every 30 seconds.

**Acceptance criteria:**
- [ ] `internal/chain/syncer.go` with `BalanceSyncer` struct
- [ ] Runs every 30 seconds, queries Convex for active dWallets, calls ChainAdapter.GetBalance for each, upserts to wallet_balances via Convex
- [ ] Graceful shutdown via context cancellation
- [ ] Started in `main.go` alongside the HTTP server

**Verification:**
- [ ] `go build ./...` succeeds
- [ ] Server starts, syncer logs balance sync attempts

**Dependencies:** Task 8, Task 14

**Files likely touched:**
- `apps/server/internal/chain/syncer.go` (new)
- `apps/server/cmd/server/main.go`

**Estimated scope:** S

---

#### Task 21: End-to-end integration test

**Description:** Manual integration test script that exercises the full demo flow: create fleet vault, register agent, submit signing request, verify on-chain state.

**Acceptance criteria:**
- [ ] Script or test that calls Go server endpoints in sequence matching the 9-step demo script
- [ ] Verifies each step succeeds before proceeding
- [ ] Documents which steps require manual setup (Ika DKG, funded wallet)

**Verification:**
- [ ] Steps 1-5 work against devnet (fleet vault created, agent registered, signing request approved on-chain)
- [ ] Steps 6-7 documented as "requires Ika pre-alpha" with fallback noted

**Dependencies:** Task 12, Task 14, Task 17

**Files likely touched:**
- `apps/server/scripts/integration-test.sh` (new) or Go test file

**Estimated scope:** M

---

### Checkpoint: Phase 8 (Final)
- [ ] Full pipeline works: API -> Go server -> Solana devnet -> (Ika pending) -> Base Sepolia
- [ ] Dashboard shows wallet data
- [ ] Balance syncer running
- [ ] All tests pass, all builds clean

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| solana-go `replace` directive causes dependency conflicts | High | Task 1 is the first task — fail fast. If conflicts, vendor the specific packages needed. |
| Ika SDK not available for Go | High | MonitorIkaStage will be a stub in Phase 1. TypeScript SDK wrapper or mock for demo. |
| Anchor discriminator encoding mismatch | Medium | Task 6 includes unit tests comparing against known-good encoded bytes from Anchor tests. |
| Convex schema migration breaks existing data | Medium | New tables only, no destructive changes to existing tables. Only additive field on agents. |
| rhemify-dwallet program too large for single deploy | Low | Program is 4 instructions with simple logic. Well within Solana's limits. |

## Open Questions

1. **Ika SDK access**: Do we have the `@ika.xyz/sdk` npm package installed? Need to verify DKG flow before Task 21.
2. **Base Sepolia RPC**: Which provider? Need an Alchemy/Infura key for BaseAdapter.
3. **Devnet SOL**: Need funded wallets for deploying rhemify-dwallet and submitting test txs.

## Parallelization Opportunities

These task groups are independent and can run in parallel:

- **Group A (Go server):** Tasks 1-12
- **Group B (Convex):** Tasks 13-14
- **Group C (Anchor program):** Tasks 15-17
- **Group D (Frontend):** Tasks 18-19

Groups converge at Task 20 (balance syncing) and Task 21 (e2e integration).
