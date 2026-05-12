import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Shared enum validators. Exported so mutation `args` validators can re-use
// them and the literal-union type flows through to db.insert / db.patch
// without lossy `v.string()` widening at the API boundary.

export const PaymentStandard = v.union(
  v.literal("mpp"),
  v.literal("x402"),
  v.literal("l402"),
  v.literal("ap2"),
);

export const FleetRole = v.union(
  v.literal("solo-founder"),
  v.literal("small-team"),
  v.literal("enterprise"),
);

export const AgentStatus = v.union(
  v.literal("running"),
  v.literal("paused"),
  v.literal("frozen"),
);

export const TransactionStatus = v.union(
  v.literal("completed"),
  v.literal("blocked"),
  v.literal("pending"),
);

export const PaymentOutcome = v.union(
  v.literal("success"),
  v.literal("rejected"),
  v.literal("failed"),
);

export const Confidence = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

export const BridgeProtocol = v.union(v.literal("cctp"), v.literal("relay"));

export const BridgeStatus = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("failed"),
);

export const PolicyDecision = v.union(
  v.literal("allow"),
  v.literal("flag"),
  v.literal("block"),
);

export const TaskOutcome = v.union(
  v.literal("success"),
  v.literal("failure"),
  v.literal("partial"),
);

export const IntelligenceActionType = v.union(
  v.literal("auto_block"),
  v.literal("auto_flag"),
  v.literal("auto_alert"),
  v.literal("recommend"),
  v.literal("auto_route"),
);

export const IntelligenceOutcome = v.union(
  v.literal("pending"),
  v.literal("applied"),
  v.literal("dismissed"),
  v.literal("reversed"),
);

export const AnchorBatchStatus = v.union(
  v.literal("pending"),
  v.literal("anchored"),
  v.literal("failed"),
);

export const SigningRequestStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("signed"),
  v.literal("broadcast"),
  v.literal("confirmed"),
  v.literal("failed"),
);

export const DWalletType = v.union(v.literal("treasury"), v.literal("agent"));

export const DWalletStatus = v.union(
  v.literal("creating"),
  v.literal("active"),
  v.literal("frozen"),
  v.literal("revoked"),
);

export default defineSchema({
  // Fleet management tables

  fleets: defineTable({
    email: v.string(),
    company_name: v.string(),
    role: FleetRole,
    active_departments: v.array(v.string()),
    monthly_spend_cap: v.float64(),
    is_deployed: v.boolean(),
    ownerUserId: v.optional(v.string()), // Better Auth user ID — links authenticated user to fleet
    api_key: v.optional(v.string()), // Fleet API key for SDK auth (Bearer token)
  })
    .index("by_email", ["email"])
    .index("by_owner", ["ownerUserId"])
    .index("by_api_key", ["api_key"]),

  agents: defineTable({
    fleet_id: v.id("fleets"),
    agent_key: v.string(),
    name: v.string(),
    department_id: v.string(),
    status: AgentStatus,
    spent_today: v.float64(),
    daily_limit: v.float64(),
    tasks_completed: v.float64(),
    primary_standard: PaymentStandard,
    skills: v.array(v.string()),
    allowed_domains: v.array(v.string()),
    allowed_standards: v.array(v.string()),
    dwallet_id: v.optional(v.string()),
  })
    .index("by_fleet", ["fleet_id"])
    .index("by_agent_key", ["agent_key"]),

  policies: defineTable({
    agent_id: v.id("agents"),
    daily_limit: v.float64(),
    max_per_transaction: v.float64(),
    approval_threshold: v.float64(),
    allowed_standards: v.array(v.string()),
    domain_allowlist: v.array(v.string()),
  }).index("by_agent", ["agent_id"]),

  transactions: defineTable({
    fleet_id: v.id("fleets"),
    agent_id: v.id("agents"),
    agent_name: v.string(),
    vendor: v.string(),
    domain: v.string(),
    amount: v.float64(),
    standard: PaymentStandard,
    status: TransactionStatus,
    blocked_reason: v.optional(v.string()),
  })
    .index("by_fleet", ["fleet_id"])
    .index("by_agent", ["agent_id"]),

  // Intelligence layer tables

  payment_events: defineTable({
    agent_id: v.string(),
    fleet_id: v.string(),
    standard: PaymentStandard,
    amount: v.float64(),
    token: v.string(),
    chain: v.string(),
    domain: v.string(),
    outcome: PaymentOutcome,
    instrument_type: v.string(),
    trace_id: v.string(),
    chain_from: v.optional(v.string()),
    chain_to: v.optional(v.string()),
  })
    .index("by_agent", ["agent_id"])
    .index("by_fleet", ["fleet_id"])
    .index("by_domain", ["domain"])
    .index("by_outcome", ["outcome"])
    .index("by_trace", ["trace_id"]),

  payment_traces: defineTable({
    payment_event_id: v.id("payment_events"),
    trace_id: v.string(),
    agent_task_context: v.string(),
    trigger_402_raw: v.string(),
    alternatives_evaluated: v.any(),
    policy_rules_fired: v.any(),
    instrument_selection_log: v.any(),
    confidence: Confidence,
    replay_snapshot: v.any(),
    trace_hash: v.string(),
    payment_tx_hash: v.optional(v.string()),
    anchor_tx_hash: v.optional(v.string()),
    merkle_proof: v.optional(v.any()),
  })
    .index("by_payment_event", ["payment_event_id"])
    .index("by_trace_id", ["trace_id"])
    .index("by_trace_hash", ["trace_hash"]),

  payment_edges: defineTable({
    from_agent_id: v.string(),
    to_service: v.string(),
    delegation_depth: v.float64(),
    cumulative_spend: v.float64(),
    last_seen_at: v.float64(),
    event_count: v.optional(v.float64()),
  })
    .index("by_agent", ["from_agent_id"])
    .index("by_service", ["to_service"])
    .index("by_agent_service", ["from_agent_id", "to_service"]),

  bridge_executions: defineTable({
    payment_event_id: v.id("payment_events"),
    protocol: BridgeProtocol,
    source_chain: v.string(),
    dest_chain: v.string(),
    source_token: v.string(),
    dest_token: v.string(),
    amount_in: v.float64(),
    amount_out: v.float64(),
    fee_paid: v.float64(),
    latency_ms: v.float64(),
    status: BridgeStatus,
  }).index("by_payment_event", ["payment_event_id"]),

  policy_decisions: defineTable({
    payment_event_id: v.id("payment_events"),
    agent_id: v.string(),
    rule_triggered: v.string(),
    decision: PolicyDecision,
    threshold: v.string(),
    actual_value: v.string(),
    domain: v.string(),
    standard: PaymentStandard,
  })
    .index("by_payment_event", ["payment_event_id"])
    .index("by_agent", ["agent_id"])
    .index("by_decision", ["decision"]),

  task_attributions: defineTable({
    agent_id: v.string(),
    task_id: v.string(),
    payment_event_id: v.id("payment_events"),
    outcome: TaskOutcome,
    cost_contribution: v.float64(),
  })
    .index("by_agent", ["agent_id"])
    .index("by_task", ["task_id"]),

  vendor_registry: defineTable({
    domain: v.string(),
    supported_standards: v.any(),
    success_rate: v.float64(),
    avg_latency_ms: v.float64(),
    uptime_pct: v.float64(),
    total_payments: v.float64(),
    last_seen_at: v.float64(),
    total_successes: v.optional(v.float64()),
    is_blocked: v.optional(v.boolean()),
    blocked_reason: v.optional(v.string()),
    blocked_at: v.optional(v.float64()),
    blocked_until: v.optional(v.float64()),
    block_count_24h: v.optional(v.float64()),
    last_blocked_at: v.optional(v.float64()),
  }).index("by_domain", ["domain"]),

  intelligence_actions: defineTable({
    action_type: IntelligenceActionType,
    trigger_rule: v.string(),
    evidence: v.any(),
    outcome: IntelligenceOutcome,
    operator_override: v.optional(v.string()),
    agent_id: v.optional(v.string()),
    domain: v.optional(v.string()),
    resolved_at: v.optional(v.float64()),
    fleet_id: v.optional(v.string()),
    trigger_event_id: v.optional(v.string()),
    severity: v.optional(v.string()),
    action_detail: v.optional(v.string()),
  })
    .index("by_action_type", ["action_type"])
    .index("by_agent", ["agent_id"])
    .index("by_outcome", ["outcome"]),

  dwallet_registry: defineTable({
    fleet_id: v.id("fleets"),
    agent_id: v.optional(v.id("agents")),
    dwallet_type: DWalletType,
    dwallet_id: v.string(),
    dwallet_cap_id: v.string(),
    supported_chains: v.array(v.string()),
    status: DWalletStatus,
    created_at: v.float64(),
  })
    .index("by_fleet", ["fleet_id"])
    .index("by_agent", ["agent_id"])
    .index("by_dwallet", ["dwallet_id"]),

  wallet_balances: defineTable({
    dwallet_id: v.string(),
    chain: v.string(),
    token: v.string(),
    amount: v.float64(),
    last_synced_at: v.float64(),
  })
    .index("by_dwallet", ["dwallet_id"])
    .index("by_dwallet_chain", ["dwallet_id", "chain"]),

  signing_requests: defineTable({
    agent_id: v.optional(v.id("agents")),
    fleet_id: v.id("fleets"),
    dwallet_id: v.string(),
    target_chain: v.string(),
    target_address: v.string(),
    token: v.string(),
    amount: v.float64(),
    status: SigningRequestStatus,
    intelligence_decision: v.optional(v.any()),
    rejection_reason: v.optional(v.string()),
    ika_signature: v.optional(v.string()),
    target_tx_hash: v.optional(v.string()),
    trace_id: v.optional(v.string()),
    created_at: v.float64(),
    resolved_at: v.optional(v.float64()),
  })
    .index("by_agent", ["agent_id"])
    .index("by_fleet", ["fleet_id"])
    .index("by_status", ["status"])
    .index("by_dwallet", ["dwallet_id"]),

  agent_aggregates: defineTable({
    agent_id: v.string(),
    fleet_id: v.string(),
    daily_spend: v.float64(),
    daily_spend_date: v.string(),
    avg_daily_7d: v.float64(),
    avg_tx_amount: v.float64(),
    total_events: v.float64(),
    active_days: v.float64(),
    success_rate: v.float64(),
    last_active: v.float64(),
  })
    .index("by_agent", ["agent_id"])
    .index("by_fleet", ["fleet_id"]),

  fleet_aggregates: defineTable({
    fleet_id: v.string(),
    hourly_spend: v.float64(),
    hourly_spend_since: v.float64(),
    avg_hourly_7d: v.float64(),
    total_spend_today: v.float64(),
    today_date: v.string(),
  }).index("by_fleet", ["fleet_id"]),

  anchor_batches: defineTable({
    fleet_id: v.string(),
    date: v.string(),
    merkle_root: v.string(),
    trace_count: v.float64(),
    pda_address: v.optional(v.string()),
    tx_hash: v.optional(v.string()),
    status: AnchorBatchStatus,
    tree_data: v.optional(v.any()),
  }).index("by_fleet_date", ["fleet_id", "date"]),
});
