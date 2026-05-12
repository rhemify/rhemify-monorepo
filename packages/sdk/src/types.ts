// --- Protocol Detection ---

export type PaymentProtocol =
  | "x402"
  | "mpp"
  | "l402"
  | "ap2"
  | "acp"
  | "unknown";

export interface DetectionResult {
  protocol: PaymentProtocol;
  confidence: "high" | "medium" | "low";
  network: string;
  price: string;
  priceRaw: bigint | number;
  currency: string;
  payTo: string;
  /**
   * Facilitator's pubkey, when the resource's 402 response specifies a third
   * party that must broadcast the payment tx and verify it on-chain. For x402
   * Solana, x402.org-style responses include extra.feePayer — the canonical
   * client flow is sign-but-don't-broadcast with feePayer = this address, then
   * the facilitator picks up the signed bytes from the X-Payment header and
   * settles. Absent when the resource doesn't use a facilitator (clients
   * broadcast their own tx — e.g. our local test-402 server).
   */
  feePayer?: string;
  /**
   * Asset contract address from the 402 response's `asset` field (x402
   * canonical) — the SPL mint pubkey on Solana, the ERC-20 contract on EVM.
   * Lets executors target the exact asset the facilitator wants rather than
   * deriving from network defaults.
   */
  asset?: string;
  /**
   * Seller-supplied memo from `extra.memo`. When present on x402 Solana, the
   * canonical SVM scheme uses these bytes (≤256) verbatim as the Memo-program
   * ix payload instead of a random nonce — gives the seller a stable handle to
   * correlate the on-chain tx with the off-chain order.
   */
  memo?: string;
  raw: {
    headers: Record<string, string>;
    body?: unknown;
  };
}

// --- Policy Engine ---

export interface PolicyConfig {
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

export interface PolicyDecision {
  action: "allow" | "flag" | "block";
  rulesFired: PolicyDecisionRecord[];
  reason?: string;
  suggestion?: string;
}

export interface PolicyDecisionRecord {
  rule: string;
  decision: "allow" | "flag" | "block";
  threshold: string;
  actual: string;
}

export interface PolicyContext {
  policy: PolicyConfig;
  spentToday: number;
  blockedDomains: string[];
}

// --- Path Resolver ---

export type InstrumentType =
  | "credit"
  | "ows"
  | "privy"
  | "agentcard"
  | "squads"
  | "jupiter"
  | "cctp";

export interface ScoredPath {
  instrument: InstrumentType;
  estimatedCost: number;
  estimatedLatency: number;
  risk: "low" | "medium" | "high";
  score: number;
  available: boolean;
  rejectedReason?: string;
}

// --- Execution ---

export interface ExecutionResult {
  success: boolean;
  data: unknown;
  txHash?: string;
  protocolReceipt?: unknown;
  response: Response;
}

export interface PaymentExecutor {
  protocol: PaymentProtocol;
  instrument: InstrumentType;
  execute(
    url: string,
    detection: DetectionResult,
    wallet: WalletConfig,
    options: PayOptions,
  ): Promise<ExecutionResult>;
}

// --- Shared Intelligence Layer Contracts ---
// Re-exported from @rhemify-monorepo/types (packages/types).
// That package is the single source of truth for the contract between
// the payment runtime (SDK) and the intelligence layer (Go server).
export type {
  PaymentEvent,
  PaymentTrace,
  PolicyDecisionEvent,
  BridgeScoring,
  EconomicRationalityCheck,
  ReplaySnapshot,
} from "@rhemify-monorepo/types";

// --- Trace (SDK-internal, produced by Trace.finalize()) ---

export interface TraceRecord {
  id: string;
  protocol: PaymentProtocol;
  amount: string;
  network: string;
  policyRulesFired: PolicyDecisionRecord[];
  alternativesEvaluated: ScoredPath[];
  chosenPath: ScoredPath;
  traceHash: string;
  anchorTxHash?: string;
}

// --- Client Config ---

export interface WalletConfig {
  solanaPrivateKey?: string;
  evmPrivateKey?: string;
}

export interface RhemifyConfig {
  serverUrl: string;
  fleetApiKey: string;
  agentId: string;
  fleetId: string;
  wallet: WalletConfig;
  defaultMaxBudget?: string;
  timeout?: number;
  policyCacheTtl?: number;
  solanaRpcUrl?: string;
  agentcardApiKey?: string;
  anchor?: {
    enabled?: boolean;
    rpcUrl?: string;
    onAnchored?: (traceId: string, txHash: string) => void;
    onError?: (traceId: string, error: Error) => void;
    maxRetries?: number;
    flushIntervalMs?: number;
  };
  onPayment?: (result: PayResult) => void | Promise<void>;
  onError?: (error: Error) => void;
  onStageComplete?: (event: StageCompleteEvent) => void;
}

export type PipelineStage = "detect" | "policy" | "resolve" | "execute" | "trace" | "anchor";

export interface StageCompleteEvent {
  stage: PipelineStage;
  timestamp: number;
  data: Record<string, unknown>;
}

// --- Public API ---

export interface PayOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  maxBudget?: string;
  dryRun?: boolean;
  taskContext?: string;
  taskStep?: number;
}

export type ProbeOptions = Pick<PayOptions, "method" | "headers">;

export interface PayResult<T = unknown> {
  success: boolean;
  data: T | null;
  trace: TraceRecord;
  detection: DetectionResult;
  receipt: {
    txHash?: string;
    protocolReceipt?: unknown;
  };
  /** Competing services discovered from Agentic Market / Tempo at pay time */
  alternatives?: import("./discovery/index.js").ServiceCandidate[];
}

export interface ProbeResult {
  canPay: boolean;
  detection: DetectionResult;
  policyDecision: PolicyDecision;
  estimatedPaths: ScoredPath[];
  estimatedCost: string;
}

export interface SessionOptions {
  maxDeposit?: string;
  ttlSeconds?: number;
  autoTopup?: boolean;
  taskContext?: string;
}

export interface MppSession {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<SessionCloseResult>;
  spent: () => number;
  remaining: () => number;
}

export interface SessionCloseResult {
  totalSpent: number;
  txHash: string;
  requestCount: number;
  traceIds: string[];
}

export interface FleetStatus {
  agentId: string;
  spentToday: number;
  dailyLimit: number;
  activeAgents: number;
  blockedDomains: string[];
}

export interface DiscoverOptions {
  limit?: number;
  protocol?: "x402" | "mpp";
  estimatedRequests?: number;
  timeoutMs?: number;
}

export interface Rhemify {
  pay: <T = unknown>(
    url: string,
    options?: PayOptions,
  ) => Promise<PayResult<T>>;
  probe: (url: string, options?: ProbeOptions) => Promise<ProbeResult>;
  session: (options?: SessionOptions) => Promise<MppSession>;
  discover: (intent: string, options?: DiscoverOptions) => Promise<import("./discovery/index.js").ServiceCandidate[]>;
  setPolicy: (policy: Partial<PolicyConfig>) => Promise<void>;
  status: () => Promise<FleetStatus>;
  /**
   * Drain pending Layer-1 Memo anchors and release internal timers.
   *
   * Per `docs/stack/02-convex.md`, each trace hash is anchored as a Solana
   * Memo tx and the resulting signature is patched into
   * `payment_traces.anchor_tx_hash`. The `AnchorQueue` does this on a 2s
   * background tick — which never fires in short-lived processes (CLIs,
   * one-shot scripts) because they exit before the next interval. Callers
   * that need Layer-1 anchoring to land in Convex MUST await this before
   * `process.exit`. Long-running services (servers, daemons) can ignore it.
   */
  close: () => Promise<void>;
}
