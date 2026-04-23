# Spec: Rhemify Payment Runtime SDK (`packages/sdk`)

## Objective

Build the core payment runtime that powers `rhemify.pay(url)` — the single API call that detects payment standards, enforces fleet policy, resolves the optimal payment path, executes payment, and emits a full decision trace.

**Who uses this:** Agent runtimes (Claude Code, OpenClaw, Codex) via MCP tools or direct SDK import. The SDK is the engine; the MCP server and CLI are thin wrappers around it.

**Why it matters:** VUP shipped a ~500-line payment pipe (detect → budget check → pay). Rhemify differentiates with a 6-stage pipeline: detect → **policy engine** → **path resolver** → execute → **trace** → **intelligence emit**. The policy engine, traces, and intelligence feed are the moat.

**Success criteria:**

- [ ] `createRhemify(config)` returns `{ pay, probe, session, setPolicy, status }`
- [ ] `pay(url)` detects x402 and MPP from real 402 responses and executes payment on Solana
- [ ] `session()` opens an MPP streaming session via `@solana/mpp` for recurring vendor payments
- [ ] Policy engine blocks payments that violate daily_limit, max_per_tx, allowed_domains, allowed_standards
- [ ] Every `pay()` call emits a full decision trace (event + trace + policy decisions) to the Go server
- [ ] Trace hashes are anchored on Solana PDAs for tamper-proof verifiability
- [ ] Path resolver selects between available instruments with scoring
- [ ] `probe(url)` returns detection result + policy evaluation without executing
- [ ] SDK works as a library import from any Node.js/Bun runtime

---

## Tech Stack

- **Language:** TypeScript (ESM, targets Node.js 20+ / Bun 1.3+)
- **Build:** tsup (CJS + ESM dual output)
- **Test:** vitest
- **Package manager:** bun (workspace member of rhemify-monorepo)
- **Runtime deps:** Zero — all protocol SDKs are optional peer deps with dynamic `import()`
- **Backend communication:** HTTP to Go server (`apps/server`) → Go server writes to Convex

---

## Commands

```bash
# From monorepo root
cd packages/sdk

# Dev (watch mode)
bun run dev

# Build
bun run build

# Test
bun test

# Type check
bun run check-types
```

---

## Project Structure

```
packages/sdk/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts              # Public API: createRhemify, types re-exports
│   ├── types.ts              # All shared types/interfaces
│   ├── errors.ts             # Error class hierarchy
│   ├── client.ts             # createRhemify() factory, orchestrates the pipeline
│   ├── detect/
│   │   ├── index.ts          # detectProtocol() — runs detector chain
│   │   ├── types.ts          # ProtocolDetector interface, DetectionResult
│   │   ├── x402.ts           # x402 detector (body.accepts, body.paymentRequirements)
│   │   ├── mpp.ts            # MPP detector (WWW-Authenticate: Payment, mppx challenge)
│   │   ├── l402.ts           # L402 detector (WWW-Authenticate: L402) — stub
│   │   ├── ap2.ts            # AP2 detector (X-AP2-Payment header) — stub
│   │   └── acp.ts            # ACP detector (X-ACP-Job header) — stub
│   ├── policy/
│   │   ├── index.ts          # PolicyEngine class
│   │   └── rules.ts          # Built-in policy rules (daily_limit, max_per_tx, etc.)
│   ├── resolve/
│   │   ├── index.ts          # PathResolver class — scores and ranks instruments
│   │   └── types.ts          # Instrument, ScoredPath interfaces
│   ├── execute/
│   │   ├── index.ts          # selectExecutor() — adapter registry
│   │   ├── types.ts          # PaymentExecutor interface
│   │   ├── x402-solana.ts    # x402 on Solana (peer dep: x402-solana)
│   │   ├── x402-evm.ts       # x402 on Base/EVM (peer dep: x402-fetch)
│   │   ├── mpp-charge.ts     # MPP one-shot charge via @solana/mpp
│   │   └── mpp-session.ts    # MPP streaming session via @solana/mpp
│   ├── trace/
│   │   ├── index.ts          # Trace class — collects decision context through pipeline
│   │   └── types.ts          # TraceSnapshot, PolicyDecisionRecord
│   ├── anchor/
│   │   ├── index.ts          # anchorTrace() — writes trace hash to Solana PDA
│   │   └── program.ts        # Anchor program IDL + PDA derivation
│   └── transport/
│       └── index.ts          # GoServerTransport — HTTP client to Go server (fleet API key auth)
└── test/
    ├── detect.test.ts
    ├── policy.test.ts
    ├── resolve.test.ts
    ├── client.test.ts
    └── fixtures/             # Recorded 402 responses for testing
```

---

## Code Style

Follow existing monorepo conventions: Oxlint + Oxfmt, no Prettier/ESLint.

```typescript
// Naming: camelCase functions, PascalCase types/classes, UPPER_SNAKE constants
// Imports: explicit, no barrel re-exports except from index.ts
// Errors: always throw typed errors, never raw strings
// Async: always async/await, never .then() chains

import type { DetectionResult, PaymentProtocol } from "./types.ts";
import { DetectionError } from "../errors.ts";

export async function detectProtocol(
  url: string,
  method: string = "GET",
  options?: { timeout?: number; headers?: Record<string, string> },
): Promise<DetectionResult> {
  const response = await fetch(url, {
    method,
    headers: options?.headers,
    signal: AbortSignal.timeout(options?.timeout ?? 10_000),
  });

  if (response.status !== 402) {
    throw new DetectionError(`Expected 402, got ${response.status}`, url);
  }

  for (const detector of detectors) {
    const result = detector.detect(response);
    if (result) return result;
  }

  return { protocol: "unknown", confidence: "low", raw: response };
}
```

---

## Architecture: The 6-Stage Pipeline

Every `pay(url)` call runs through this pipeline in order. Each stage is a separate module. The `Trace` object flows through all stages, collecting decision context.

```
┌─────────────────────────────────────────────────────────┐
│                    rhemify.pay(url)                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. DETECT ──→ DetectionResult                          │
│     Chain of ProtocolDetectors, first match wins        │
│     Output: protocol, network, price, payTo, confidence │
│                                                         │
│  2. POLICY ──→ PolicyDecision                           │
│     Evaluate all rules against agent context             │
│     Output: allow | flag | block + rules_fired[]        │
│     If block → return structured rejection, skip 3-5    │
│                                                         │
│  3. RESOLVE ──→ ScoredPath[]                            │
│     Score available instruments by cost/latency/risk    │
│     Output: ranked paths, chosen path, alternatives     │
│                                                         │
│  4. EXECUTE ──→ ExecutionResult                         │
│     Run the chosen executor adapter                     │
│     If fail → try next path (cascade)                   │
│     Output: response data, tx hash, protocol receipt    │
│                                                         │
│  5. TRACE ──→ DecisionTrace                             │
│     Finalize trace with execution result                │
│     Compute trace hash (SHA-256 of canonical fields)    │
│                                                         │
│  6. EMIT ──→ fire-and-await to Go server                │
│     POST /api/ingest/payment                            │
│     Payload: PaymentEvent + DecisionTrace + PolicyDecisions │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Return: PayResult { success, data, trace, detection }  │
└─────────────────────────────────────────────────────────┘
```

### Data flow through Go server

```
SDK                          Go Server                    Convex
 │                              │                           │
 ├── POST /api/ingest/payment ──→ validate + enrich ────────→ mutation: insertPaymentEvent
 │                              │                           │ mutation: insertPaymentTrace
 │                              │                           │ mutation: insertPolicyDecisions
 │                              │                           │ mutation: upsertVendorRegistry
 │                              │                           │ mutation: upsertPaymentEdge
 │                              │
 ├── GET /api/policy/:agentId ──→ read from Convex ─────────→ query: getAgentPolicy
 │                              │                           │ query: getAgentAggregates
 │                              │                           │ query: getVendorStatus
 │                              │
 ├── POST /api/policy/:agentId ─→ write to Convex ─────────→ mutation: upsertPolicy
 │                              │
 └── GET /api/fleet/status ─────→ read from Convex ─────────→ query: getFleetStats
```

---

## Public API

### `createRhemify(config: RhemifyConfig): Rhemify`

Factory function. Returns the SDK client.

```typescript
interface RhemifyConfig {
  // Required
  serverUrl: string; // Go server URL (e.g. "http://localhost:8080")
  fleetApiKey: string; // Shared fleet API key (sent as Authorization: Bearer <key>)
  agentId: string; // This agent's ID in the fleet
  fleetId: string; // Fleet this agent belongs to

  // Wallet (at least one required)
  wallet: {
    solanaPrivateKey?: string; // Base58 Solana private key
    evmPrivateKey?: string; // Hex EVM private key
  };

  // Optional
  defaultMaxBudget?: string; // e.g. "$1.00" — per-call budget cap (client-side safety net)
  timeout?: number; // Detection timeout in ms (default 10_000)
  policyCacheTtl?: number; // Policy cache TTL in ms (default 30_000)
  solanaRpcUrl?: string; // Solana RPC endpoint (default: Helius mainnet)
  onPayment?: (result: PayResult) => void | Promise<void>;
  onError?: (error: RhemifyError) => void;
}

interface Rhemify {
  pay: <T = unknown>(url: string, options?: PayOptions) => Promise<PayResult<T>>;
  probe: (url: string, options?: ProbeOptions) => Promise<ProbeResult>;
  session: (options?: SessionOptions) => Promise<MppSession>;
  setPolicy: (policy: Partial<PolicyConfig>) => Promise<void>;
  status: () => Promise<FleetStatus>;
}
```

### `rhemify.pay(url, options?)`

The core method. Runs the full 6-stage pipeline.

```typescript
interface PayOptions {
  method?: string; // HTTP method (default "GET")
  headers?: Record<string, string>;
  body?: unknown; // Request body for POST/PUT
  maxBudget?: string; // Override per-call budget
  dryRun?: boolean; // Run detect + policy + resolve, but don't execute
  taskContext?: string; // Agent's task description (for trace)
  taskStep?: number; // Current step in agent's task
}

interface PayResult<T = unknown> {
  success: boolean;
  data: T | null; // Response body from the paid request
  trace: {
    id: string; // Trace ID (trc_...)
    protocol: PaymentProtocol;
    amount: string;
    network: string;
    policyRulesFired: PolicyDecisionRecord[];
    alternativesEvaluated: ScoredPath[];
    chosenPath: ScoredPath;
    traceHash: string; // SHA-256 of canonical trace fields
  };
  detection: DetectionResult;
  receipt: {
    txHash?: string; // On-chain transaction hash
    protocolReceipt?: unknown; // Protocol-specific receipt data
  };
}
```

### `rhemify.probe(url, options?)`

Detect + policy evaluate without paying. Useful for pre-flight checks.

```typescript
interface ProbeResult {
  canPay: boolean; // Would policy allow this payment?
  detection: DetectionResult;
  policyDecision: PolicyDecision;
  estimatedPaths: ScoredPath[]; // Ranked instruments
  estimatedCost: string; // Best path cost
}
```

### `rhemify.setPolicy(policy)`

Update this agent's policy via Go server.

```typescript
interface PolicyConfig {
  dailyLimit: number;
  maxPerTransaction: number;
  approvalThreshold: number;
  allowedStandards: PaymentProtocol[];
  domainAllowlist: string[];
  intelligence?: {
    enabled: boolean;
    autoBlockVendors: boolean;
    autoRouteOptimization: boolean;
  };
}
```

### `rhemify.session(options?)`

Open an MPP streaming session for recurring vendor payments. Built on `@solana/mpp` sessions — the agent opens a payment channel with a deposit, then signs cheap cumulative vouchers per request instead of full transactions.

The session is wrapped by the Rhemify pipeline: policy is evaluated on `open()`, every `fetch()` call emits a trace, and the session respects governance (daily limits apply to cumulative session spend).

```typescript
interface SessionOptions {
  maxDeposit?: string; // Max deposit in USDC (default "1.00")
  ttlSeconds?: number; // Session TTL (default 3600 = 1hr)
  autoTopup?: boolean; // Auto top-up when deposit runs low (default false)
  taskContext?: string; // Agent's task description (for traces)
}

interface MppSession {
  fetch: (url: string, init?: RequestInit) => Promise<Response>; // Drop-in fetch replacement
  close: () => Promise<SessionCloseResult>; // Settle and close channel
  spent: () => number; // Current cumulative spend
  remaining: () => number; // Remaining deposit
}

interface SessionCloseResult {
  totalSpent: number;
  txHash: string; // Settlement transaction
  requestCount: number;
  traceIds: string[]; // All traces emitted during session
}
```

**Key difference from VUP:** VUP's `session()` returns the raw mppx instance, bypassing their own budget/receipt pipeline. Rhemify wraps the session — every `fetch()` goes through policy evaluation, every request gets a trace, and cumulative spend counts against the agent's daily limit.

### `rhemify.status()`

Get fleet status from Go server.

```typescript
interface FleetStatus {
  agentId: string;
  spentToday: number;
  dailyLimit: number;
  activeAgents: number;
  blockedDomains: string[];
}
```

---

## Trace Anchoring on Solana

Every decision trace is anchored on-chain for tamper-proof verifiability. This is the "proof" in "here's proof of what happened."

### How It Works

1. After trace finalization (stage 5), compute `traceHash = SHA-256(canonical JSON of trace fields)`
2. Derive a PDA: `seeds = ["rhemify-trace", fleetId, traceId]`
3. Write a small on-chain record via a Rhemify Anchor program:
   ```
   TraceAnchor {
     trace_id: String,
     trace_hash: [u8; 32],
     agent_id: String,
     fleet_id: String,
     amount: u64,
     protocol: String,
     timestamp: i64,
   }
   ```
4. The PDA address + tx signature are included in the `PayResult.trace`

### Anchor Program

A minimal Solana program (Anchor framework) with a single instruction: `anchor_trace`. Deployed once. The SDK calls it via `@coral-xyz/anchor` or raw transaction construction.

**Cost:** ~0.002 SOL per trace anchor (rent-exempt minimum for small account). For the hackathon, this is acceptable. Post-hackathon, batch multiple traces into a single Merkle root anchor to amortize cost.

### Verification

Anyone with the trace data can:

1. Recompute the SHA-256 hash from the trace fields
2. Derive the PDA from `["rhemify-trace", fleetId, traceId]`
3. Read the on-chain account and compare hashes
4. If they match → trace has not been tampered with since anchoring

This is the compliance story: "Every payment decision is cryptographically anchored on Solana. You can independently verify any trace."

---

## Core Interfaces

### Protocol Detection

```typescript
type PaymentProtocol = "x402" | "mpp" | "l402" | "ap2" | "acp" | "unknown";

interface ProtocolDetector {
  name: string;
  detect(response: Response): DetectionResult | null;
}

interface DetectionResult {
  protocol: PaymentProtocol;
  confidence: "high" | "medium" | "low";
  network: string; // "solana-mainnet" | "base" | "base-sepolia" | etc.
  price: string; // Human-readable: "$0.50"
  priceRaw: bigint | number; // Raw amount in smallest unit
  currency: string; // "USDC" | "SOL" | etc.
  payTo: string; // Recipient address
  raw: {
    // Protocol-specific fields
    headers: Record<string, string>;
    body?: unknown;
  };
}
```

### Policy Engine

```typescript
interface PolicyDecision {
  action: "allow" | "flag" | "block";
  rulesFired: PolicyDecisionRecord[];
  reason?: string; // Human-readable reason (for block/flag)
  suggestion?: string; // Actionable suggestion for agent
}

interface PolicyDecisionRecord {
  rule: string; // "daily_limit" | "max_per_tx" | "domain_allowlist" | etc.
  decision: "allow" | "flag" | "block";
  threshold: string; // What the limit is
  actual: string; // What the value was
}
```

### Path Resolver

```typescript
type InstrumentType = "ows" | "privy" | "agentcard" | "squads" | "jupiter" | "cctp";

interface ScoredPath {
  instrument: InstrumentType;
  estimatedCost: number; // In USD
  estimatedLatency: number; // In ms
  risk: "low" | "medium" | "high";
  score: number; // Composite score (lower = better)
  available: boolean; // Does the wallet support this?
  rejectedReason?: string; // Why this path wasn't chosen
}
```

### Payment Executor

```typescript
interface PaymentExecutor {
  protocol: PaymentProtocol;
  instrument: InstrumentType;
  execute(
    url: string,
    detection: DetectionResult,
    wallet: WalletConfig,
    options: PayOptions,
  ): Promise<ExecutionResult>;
}

interface ExecutionResult {
  success: boolean;
  data: unknown;
  txHash?: string;
  protocolReceipt?: unknown;
  response: Response;
}
```

---

## Error Hierarchy

```typescript
class RhemifyError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "RhemifyError";
  }
}

class DetectionError extends RhemifyError {
  constructor(
    message: string,
    public url: string,
  ) {
    super(message, "DETECTION_FAILED");
  }
}

class PolicyBlockedError extends RhemifyError {
  constructor(
    message: string,
    public decision: PolicyDecision,
  ) {
    super(message, "POLICY_BLOCKED");
  }
}

class BudgetExceededError extends RhemifyError {
  constructor(
    public price: number,
    public budget: number,
  ) {
    super(`Price $${price} exceeds budget $${budget}`, "BUDGET_EXCEEDED");
  }
}

class NoWalletError extends RhemifyError {
  constructor(public requiredChain: string) {
    super(`No wallet configured for ${requiredChain}`, "NO_WALLET");
  }
}

class ExecutionError extends RhemifyError {
  constructor(
    message: string,
    public statusCode?: number,
    public txHash?: string,
  ) {
    super(message, "EXECUTION_FAILED");
  }
}
```

---

## Go Server Endpoints (New — SDK Depends On)

All endpoints require `Authorization: Bearer <fleetApiKey>`. The Go server validates the key against the fleet record in Convex.

```
POST /api/ingest/payment        # Ingest payment event + trace + policy decisions
  Body: { event: PaymentEvent, trace: DecisionTrace, policyDecisions: PolicyDecisionRecord[] }
  Response: { eventId: string, traceId: string }

GET  /api/policy/:agentId       # Get agent's current policy + aggregates + blocked domains
  Response: { policy: PolicyConfig, spentToday: number, blockedDomains: string[] }

POST /api/policy/:agentId       # Update agent's policy
  Body: Partial<PolicyConfig>
  Response: { ok: true }

GET  /api/vendor/:domain        # Get vendor status (is it blocked? stats?)
  Response: { domain, isBlocked, successRate, avgLatencyMs }

GET  /api/fleet/status          # Fleet-level stats for this agent's fleet
  Response: FleetStatus
```

---

## Testing Strategy

**Framework:** vitest
**Location:** `packages/sdk/test/`
**Coverage target:** 80%+ on detect/, policy/, resolve/. Executors are tested via integration.

### Test levels:

| Level           | What                                       | How                                                   |
| --------------- | ------------------------------------------ | ----------------------------------------------------- |
| **Unit**        | Detectors parse 402 responses correctly    | Recorded HTTP responses in `test/fixtures/`           |
| **Unit**        | Policy engine evaluates rules correctly    | Mock policy configs + detection results               |
| **Unit**        | Path resolver scores instruments correctly | Mock wallet configs + detection results               |
| **Integration** | Full `pay()` pipeline with mock server     | msw or custom HTTP mock for 402 endpoints + Go server |
| **E2E**         | Real payment against testnet               | Manual / CI with devnet keys (stretch goal)           |

### Fixture-driven detection tests:

```typescript
// test/fixtures/x402-solana.json
{
  "status": 402,
  "headers": { "content-type": "application/json" },
  "body": {
    "accepts": [{
      "scheme": "exact",
      "network": "solana-mainnet",
      "maxAmountRequired": "500000",
      "resource": "https://api.example.com/data",
      "payTo": "So1ana...",
      "extra": { "name": "USDC" }
    }]
  }
}

// test/detect.test.ts
it("detects x402 on Solana from body.accepts", async () => {
  const response = fixtureToResponse("x402-solana.json");
  const result = x402Detector.detect(response);
  expect(result?.protocol).toBe("x402");
  expect(result?.network).toBe("solana-mainnet");
});
```

---

## Boundaries

### Always:

- Run the full pipeline (detect → policy → resolve → execute → trace → emit) — never skip stages
- Emit a trace for every `pay()` call, including failed/blocked ones
- Enforce policy BEFORE execution — money never moves if policy blocks
- Use typed errors — never throw raw strings
- Dynamic `import()` for all protocol SDKs — zero mandatory runtime deps
- SHA-256 hash every trace for tamper detection

### Ask first:

- Adding a new payment protocol or instrument
- Changing the Go server API contract
- Adding a new runtime dependency
- Changing the policy evaluation order

### Never:

- Execute payment without policy evaluation
- Skip trace emission (even on failure)
- Store private keys in traces or logs
- Make Convex calls directly from the SDK (always go through Go server)
- Add browser support (server-side only for now)

---

## Peer Dependencies (Optional, Dynamic Import)

```json
{
  "peerDependencies": {
    "x402-fetch": ">=0.1.0",
    "x402-solana": ">=0.1.0",
    "@solana/mpp": ">=0.2.0",
    "mppx": ">=0.3.15",
    "@solana/kit": ">=6.5.0",
    "@coral-xyz/anchor": ">=0.30.0",
    "viem": ">=2.0.0",
    "bs58": ">=5.0.0"
  },
  "peerDependenciesMeta": {
    "x402-fetch": { "optional": true },
    "x402-solana": { "optional": true },
    "@solana/mpp": { "optional": true },
    "mppx": { "optional": true },
    "@solana/kit": { "optional": true },
    "@coral-xyz/anchor": { "optional": true },
    "viem": { "optional": true },
    "bs58": { "optional": true }
  }
}
```

**MPP stack:** `@solana/mpp` is the Solana Foundation's official MPP implementation. It depends on `mppx` (by wevm) as the protocol-level framework. `@solana/mpp` provides Solana-specific charge and session methods. `mppx` provides the HTTP 402 challenge/response wire protocol, server middleware, and client fetch wrapper.

- **Charge (one-shot):** `@solana/mpp/client` → `solana.charge({ signer })` → `Mppx.create({ methods: [method] })` → `mppx.fetch(url)`
- **Session (streaming):** `@solana/mpp/client` → `solana.session({ signer, authorizer })` → cumulative voucher signing, no full tx per request
- **Detection:** MPP endpoints return HTTP 402 with `WWW-Authenticate: Payment` header. The mppx challenge body contains `amount`, `currency`, `recipient`, `methodDetails` (network, decimals, etc.)

**Trace anchoring stack:** `@coral-xyz/anchor` for interacting with the Rhemify Anchor program on Solana. `@solana/kit` for transaction construction and signing.

---

## Hackathon Scope (5 weeks — started Apr 6, 2026)

### Week 1: Foundation (match VUP)

- [ ] Package scaffolding (tsup, vitest, workspace config)
- [ ] Detector chain: x402 + MPP working, L402/AP2/ACP stubs
- [ ] Error hierarchy
- [ ] Transport layer (HTTP client to Go server, fleet API key auth)
- [ ] Go server: POST /api/ingest/payment + GET /api/policy/:agentId endpoints

### Week 2: Moat features

- [ ] Policy engine: daily_limit, max_per_tx, allowed_domains, allowed_standards
- [ ] Policy cache (30s TTL, invalidate on setPolicy())
- [ ] Path resolver: score OWS vs AgentCard (basic)
- [ ] Trace capture: full pipeline context collection
- [ ] Trace anchoring: Anchor program + anchorTrace() in SDK
- [ ] `createRhemify()` factory wiring everything together

### Week 3: Execution

- [ ] x402 Solana executor via `x402-solana` peer dep
- [ ] x402 EVM executor via `x402-fetch` peer dep
- [ ] MPP charge executor via `@solana/mpp` charge method
- [ ] MPP session executor via `@solana/mpp` session method (streaming)
- [ ] Cascade on executor failure (try next path)
- [ ] `probe()` method

### Week 4: Integration

- [ ] MCP server wrapper (rhemify.pay, rhemify.session, rhemify.status, rhemify.set_policy tools)
- [ ] Wire to dashboard (Go server → Convex → frontend reads)
- [ ] Real 402 endpoint testing (at least 2 real endpoints)
- [ ] `session()` method with governance wrapper

### Week 5: Polish + Demo

- [ ] Decision replay (Go server endpoint + dashboard UI)
- [ ] AgentCard integration (stretch)
- [ ] CCTP bridge (stretch)
- [ ] Demo script rehearsal — 5-act narrative from hackathon-positioning.md

---

## Resolved Decisions

| #   | Decision               | Choice                                                     | Rationale                                                                                                    |
| --- | ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | **Go server auth**     | Shared fleet API key (`Authorization: Bearer <key>`)       | Simplest for hackathon. One key per fleet, passed in `RhemifyConfig.fleetApiKey`.                            |
| 2   | **Policy caching**     | Cache 30s, invalidate on `setPolicy()`                     | Balances freshness vs latency. Config via `policyCacheTtl`.                                                  |
| 3   | **Trace anchoring**    | In scope — Solana PDA via Anchor program                   | Core differentiator. "Verifiable" is in the tagline. Minimal program (~100 lines Rust).                      |
| 4   | **x402 execution**     | Use `x402-fetch` + `x402-solana` peer deps                 | Ship fast. Wrap their output to capture trace context.                                                       |
| 5   | **MPP implementation** | `@solana/mpp` (Solana Foundation SDK) + streaming sessions | Official Solana Foundation MPP. Supports charge (one-shot) AND session (streaming). Built on `mppx` by wevm. |
