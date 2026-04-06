/**
 * Shared Intelligence Layer Contracts
 *
 * These are the canonical interfaces between the payment runtime (packages/sdk)
 * and the intelligence layer (apps/server). Both sides must match these shapes.
 *
 * Spec: docs/intelligence-layer-spec.md
 */

// --- Payment Protocols ---

export type PaymentProtocol =
  | "x402"
  | "mpp"
  | "l402"
  | "ap2"
  | "acp"
  | "unknown";

// --- Payment Event ---

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

// --- Payment Trace ---

/** The reasoning behind each payment decision. Append-only, never modified. */
export interface PaymentTrace {
  id: string;
  payment_event_id: string;
  agent_task_description: string;
  agent_task_step: number | null;
  trigger_402_raw: string;
  standard_detected: PaymentProtocol;
  standard_confidence: "high" | "medium" | "low";
  alternatives_evaluated: ScoredPathSummary[];
  policy_rules_fired: PolicyRuleFired[];
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

// --- Policy Decision ---

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

// --- Supporting Types ---

export interface PolicyRuleFired {
  rule: string;
  decision: "allow" | "flag" | "block";
  threshold: string;
  actual: string;
}

export interface ScoredPathSummary {
  instrument: string;
  estimatedCost: number;
  estimatedLatency: number;
  risk: "low" | "medium" | "high";
  score: number;
  available: boolean;
  rejectedReason?: string;
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
  policy_state: PolicyState;
  vendor_registry_snapshot?: Record<string, unknown>;
  agent_context?: string;
  detection: DetectionSummary;
  all_paths: ScoredPathSummary[];
  policy_decision: PolicyDecisionSummary;
}

export interface PolicyState {
  dailyLimit: number;
  maxPerTransaction: number;
  approvalThreshold: number;
  allowedStandards: PaymentProtocol[];
  domainAllowlist: string[];
}

export interface DetectionSummary {
  protocol: PaymentProtocol;
  confidence: "high" | "medium" | "low";
  network: string;
  price: string;
  priceRaw: bigint | number;
  currency: string;
  payTo: string;
}

export interface PolicyDecisionSummary {
  action: "allow" | "flag" | "block";
  rulesFired: PolicyRuleFired[];
  reason?: string;
  suggestion?: string;
}

// --- Ingest Payload (SDK → Go Server) ---

export interface IngestPayload {
  event: PaymentEvent;
  trace: PaymentTrace;
  policyDecisions: PolicyDecisionEvent[];
}
