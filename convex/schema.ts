import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Fleet management tables

  fleets: defineTable({
    email: v.string(),
    company_name: v.string(),
    role: v.string(), // solo-founder | small-team | enterprise
    active_departments: v.array(v.string()),
    monthly_spend_cap: v.float64(),
    is_deployed: v.boolean(),
  }).index("by_email", ["email"]),

  agents: defineTable({
    fleet_id: v.id("fleets"),
    agent_key: v.string(), // e.g. "ceo-001"
    name: v.string(),
    department_id: v.string(), // resolves to Department template client-side
    status: v.string(), // running | paused | frozen
    spent_today: v.float64(),
    daily_limit: v.float64(),
    tasks_completed: v.float64(),
    primary_standard: v.string(), // mpp | x402 | l402 | ap2
    skills: v.array(v.string()),
    allowed_domains: v.array(v.string()),
    allowed_standards: v.array(v.string()),
    dwallet_id: v.optional(v.string()), // Ika dWallet linked to this agent
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
    standard: v.string(), // mpp | x402 | l402 | ap2
    status: v.string(), // completed | blocked | pending
    blocked_reason: v.optional(v.string()),
  })
    .index("by_fleet", ["fleet_id"])
    .index("by_agent", ["agent_id"]),

  // Intelligence layer tables

  // Append-only: every payment attempt (success, rejected, failed)
  payment_events: defineTable({
    agent_id: v.string(),
    fleet_id: v.string(),
    standard: v.string(), // x402 | mpp | l402 | ap2
    amount: v.float64(),
    token: v.string(),
    chain: v.string(),
    domain: v.string(),
    outcome: v.string(), // success | rejected | failed
    instrument_type: v.string(),
    trace_id: v.string(),
  })
    .index("by_agent", ["agent_id"])
    .index("by_fleet", ["fleet_id"])
    .index("by_domain", ["domain"])
    .index("by_outcome", ["outcome"])
    .index("by_trace", ["trace_id"]),

  // Append-only: full reasoning context for each payment decision
  payment_traces: defineTable({
    payment_event_id: v.id("payment_events"),
    trace_id: v.string(), // SDK-generated trace ID (trc_...)
    agent_task_context: v.string(),
    trigger_402_raw: v.string(),
    alternatives_evaluated: v.any(), // JSON array
    policy_rules_fired: v.any(), // JSON array
    instrument_selection_log: v.any(), // JSON object
    confidence: v.string(), // high | medium | low
    replay_snapshot: v.any(), // JSON object
    trace_hash: v.string(), // SHA-256 of canonical trace fields
    anchor_tx_hash: v.optional(v.string()), // Layer 1: Solana Memo tx signature
    merkle_proof: v.optional(v.any()), // Layer 2: sibling hashes for Merkle verification
  })
    .index("by_payment_event", ["payment_event_id"])
    .index("by_trace_id", ["trace_id"])
    .index("by_trace_hash", ["trace_hash"]),

  // Agent-to-service spending graph
  payment_edges: defineTable({
    from_agent_id: v.string(),
    to_service: v.string(),
    delegation_depth: v.float64(),
    cumulative_spend: v.float64(),
    last_seen_at: v.float64(), // epoch ms
    event_count: v.optional(v.float64()),
  })
    .index("by_agent", ["from_agent_id"])
    .index("by_service", ["to_service"])
    .index("by_agent_service", ["from_agent_id", "to_service"]),

  // Cross-chain bridge execution records
  bridge_executions: defineTable({
    payment_event_id: v.id("payment_events"),
    protocol: v.string(), // cctp | relay
    source_chain: v.string(),
    dest_chain: v.string(),
    source_token: v.string(),
    dest_token: v.string(),
    amount_in: v.float64(),
    amount_out: v.float64(),
    fee_paid: v.float64(),
    latency_ms: v.float64(),
    status: v.string(), // pending | completed | failed
  }).index("by_payment_event", ["payment_event_id"]),

  // Every policy rule evaluation per payment
  policy_decisions: defineTable({
    payment_event_id: v.id("payment_events"),
    agent_id: v.string(),
    rule_triggered: v.string(),
    decision: v.string(), // allow | flag | block
    threshold: v.string(),
    actual_value: v.string(),
    domain: v.string(),
    standard: v.string(),
  })
    .index("by_payment_event", ["payment_event_id"])
    .index("by_agent", ["agent_id"])
    .index("by_decision", ["decision"]),

  // Links payments to task outcomes for ROI tracking
  task_attributions: defineTable({
    agent_id: v.string(),
    task_id: v.string(),
    payment_event_id: v.id("payment_events"),
    outcome: v.string(), // success | failure | partial
    cost_contribution: v.float64(),
  })
    .index("by_agent", ["agent_id"])
    .index("by_task", ["task_id"]),

  // Vendor reliability and performance tracking
  vendor_registry: defineTable({
    domain: v.string(),
    supported_standards: v.any(), // JSON array
    success_rate: v.float64(),
    avg_latency_ms: v.float64(),
    uptime_pct: v.float64(),
    total_payments: v.float64(),
    last_seen_at: v.float64(), // epoch ms
    total_successes: v.optional(v.float64()),
    is_blocked: v.optional(v.boolean()),
    blocked_reason: v.optional(v.string()),
    blocked_at: v.optional(v.float64()),
    blocked_until: v.optional(v.float64()),
    block_count_24h: v.optional(v.float64()),
    last_blocked_at: v.optional(v.float64()),
  }).index("by_domain", ["domain"]),

  // Actions taken by the intelligence rules engine
  intelligence_actions: defineTable({
    action_type: v.string(), // auto_block | auto_flag | auto_alert | recommend | auto_route
    trigger_rule: v.string(),
    evidence: v.any(), // JSON object
    outcome: v.string(), // pending | applied | dismissed | reversed
    operator_override: v.optional(v.string()),
    agent_id: v.optional(v.string()),
    domain: v.optional(v.string()),
    resolved_at: v.optional(v.float64()), // epoch ms
    fleet_id: v.optional(v.string()),
    trigger_event_id: v.optional(v.string()),
    severity: v.optional(v.string()),
    action_detail: v.optional(v.string()),
  })
    .index("by_action_type", ["action_type"])
    .index("by_agent", ["agent_id"])
    .index("by_outcome", ["outcome"]),

  // dWallet registry — fleet treasury and agent wallets
  dwallet_registry: defineTable({
    fleet_id: v.id("fleets"),
    agent_id: v.optional(v.id("agents")), // null = fleet treasury dWallet
    dwallet_type: v.union(v.literal("treasury"), v.literal("agent")),
    dwallet_id: v.string(), // Ika dWallet identifier
    dwallet_cap_id: v.string(), // ownership cap (Solana account)
    supported_chains: v.array(v.string()), // ["ethereum", "base", "arbitrum"]
    status: v.union(v.literal("creating"), v.literal("active"), v.literal("frozen"), v.literal("revoked")),
    created_at: v.float64(),
  })
    .index("by_fleet", ["fleet_id"])
    .index("by_agent", ["agent_id"])
    .index("by_dwallet", ["dwallet_id"]),

  // Cross-chain wallet balances synced by Go server
  wallet_balances: defineTable({
    dwallet_id: v.string(),
    chain: v.string(), // "ethereum" | "base" | "arbitrum"
    token: v.string(), // "ETH" | "USDC" | etc.
    amount: v.float64(),
    last_synced_at: v.float64(),
  })
    .index("by_dwallet", ["dwallet_id"])
    .index("by_dwallet_chain", ["dwallet_id", "chain"]),

  // Signing requests — agent payment approval pipeline
  signing_requests: defineTable({
    agent_id: v.optional(v.id("agents")),
    fleet_id: v.id("fleets"),
    dwallet_id: v.string(),
    target_chain: v.string(), // "base" | "arbitrum" | "ethereum"
    target_address: v.string(),
    token: v.string(),
    amount: v.float64(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("signed"), v.literal("broadcast"), v.literal("confirmed"), v.literal("failed")),
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

  // Materialized per-agent aggregates (updated on every payment event ingest)
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

  // Materialized per-fleet aggregates (updated on every payment event ingest)
  fleet_aggregates: defineTable({
    fleet_id: v.string(),
    hourly_spend: v.float64(),
    hourly_spend_since: v.float64(),
    avg_hourly_7d: v.float64(),
    total_spend_today: v.float64(),
    today_date: v.string(),
  }).index("by_fleet", ["fleet_id"]),

  // Daily Merkle root batches (Layer 2 trace anchoring)
  anchor_batches: defineTable({
    fleet_id: v.string(),
    date: v.string(), // "YYYY-MM-DD" UTC
    merkle_root: v.string(), // hex
    trace_count: v.float64(),
    pda_address: v.optional(v.string()), // base58 Solana PDA
    tx_hash: v.optional(v.string()), // Solana tx signature
    status: v.string(), // pending | anchored | failed
    tree_data: v.optional(v.any()), // Full Merkle tree for proof generation
  }).index("by_fleet_date", ["fleet_id", "date"]),
});
