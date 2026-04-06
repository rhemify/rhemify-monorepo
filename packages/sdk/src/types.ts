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
// These are the canonical interfaces between the payment runtime (SDK)
// and the intelligence layer (Go server). Both sides must match these shapes.
// Spec: docs/intelligence-layer-spec.md

/** Every call to rhemos.pay() emits a PaymentEvent — the facts of what happened. */
export interface PaymentEvent {
  id: string;
  timestamp: string;
  agent_id: string;
  fleet_id: string;
  standard: PaymentProtocol;
  standard_version: string;
  amount: number;
  token: string;
  chain_from: string;
  chain_to: string;
  domain: string;
  outcome: "success" | "rejected" | "failed";
  parent_event_id: string | null;
  delegation_depth: number;
  instrument_type: string;
  trace_id: string;
}

/** The reasoning behind each payment decision. Append-only, never modified. */
export interface PaymentTrace {
  id: string;
  payment_event_id: string;
  agent_task_description: string;
  agent_task_step: number | null;
  trigger_402_raw: string;
  standard_detected: PaymentProtocol;
  standard_confidence: "high" | "medium" | "low";
  alternatives_evaluated: ScoredPath[];
  policy_rules_fired: PolicyDecisionRecord[];
  instrument_selection_log: string;
  bridge_scoring: BridgeScoring | null;
  economic_rationality_check: EconomicRationalityCheck | null;
  task_outcome: "success" | "failure" | "pending" | null;
  task_outcome_linked_at: string | null;
  replay_snapshot: ReplaySnapshot;
  trace_hash: string;
  anchor_tx_hash: string | null;
  merkle_proof: string[] | null;
}

export interface BridgeScoring {
  [provider: string]: { cost: number; time: number };
}

export interface EconomicRationalityCheck {
  bridge_cost_pct: number;
  threshold: number;
  passed: boolean;
}

export interface ReplaySnapshot {
  policy_state: PolicyConfig;
  vendor_registry_snapshot?: Record<string, unknown>;
  agent_context?: string;
  detection: DetectionResult;
  all_paths: ScoredPath[];
  policy_decision: PolicyDecision;
}

/** Every policy rule evaluation, whether it passed or blocked. */
export interface PolicyDecisionEvent {
  id: string;
  payment_event_id: string;
  agent_id: string;
  rule_triggered: string;
  decision: "allow" | "flag" | "block";
  threshold: string;
  actual_value: string;
  domain: string;
  standard: PaymentProtocol;
  human_approval_required: boolean;
}

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

export interface RhemosConfig {
  serverUrl: string;
  fleetApiKey: string;
  agentId: string;
  fleetId: string;
  wallet: WalletConfig;
  defaultMaxBudget?: string;
  timeout?: number;
  policyCacheTtl?: number;
  solanaRpcUrl?: string;
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

export interface Rhemos {
  pay: <T = unknown>(
    url: string,
    options?: PayOptions,
  ) => Promise<PayResult<T>>;
  probe: (url: string, options?: ProbeOptions) => Promise<ProbeResult>;
  session: (options?: SessionOptions) => Promise<MppSession>;
  setPolicy: (policy: Partial<PolicyConfig>) => Promise<void>;
  status: () => Promise<FleetStatus>;
}
