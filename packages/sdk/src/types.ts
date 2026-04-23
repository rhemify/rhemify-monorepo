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

export interface Rhemify {
  pay: <T = unknown>(
    url: string,
    options?: PayOptions,
  ) => Promise<PayResult<T>>;
  probe: (url: string, options?: ProbeOptions) => Promise<ProbeResult>;
  session: (options?: SessionOptions) => Promise<MppSession>;
  setPolicy: (policy: Partial<PolicyConfig>) => Promise<void>;
  status: () => Promise<FleetStatus>;
}
