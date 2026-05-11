/**
 * Demo seed mutation — populates the local Convex deployment with
 * realistic-looking data for the TUI dashboard (apps/tui/).
 *
 * Public mutation, but only meaningful against a local anonymous
 * Convex deployment (`bunx convex dev` selecting "Start without an
 * account"). Calling it against the shared dev/prod deployments would
 * pollute team data — guarded by a name pattern: it only inserts if
 * no fleet with email "demo@rhemify.local" already exists, and only
 * touches records under that fleet.
 */

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  PaymentStandard,
  AgentStatus,
  TransactionStatus,
  PaymentOutcome,
  IntelligenceActionType,
  IntelligenceOutcome,
} from "./schema";

const VENDORS = [
  "perplexity.ai",
  "openai.com",
  "anthropic.com",
  "stripe.com",
  "notion.so",
  "github.com",
  "supabase.com",
  "vercel.com",
];

const AGENT_DEFS = [
  { key: "ceo-001", name: "CEO Agent", dept: "ceo", primary: "mpp" as const },
  { key: "research-001", name: "Research Agent", dept: "research", primary: "x402" as const },
  { key: "marketing-001", name: "Marketing Agent", dept: "marketing", primary: "mpp" as const },
  { key: "sales-001", name: "Sales Agent", dept: "sales", primary: "x402" as const },
  { key: "engineering-001", name: "Engineering Agent", dept: "engineering", primary: "x402" as const },
  { key: "finance-001", name: "Finance Agent", dept: "finance", primary: "mpp" as const },
];

const RULES = [
  "VH-1: vendor uptime drop",
  "SA-1: spend anomaly detected",
  "SA-2: subscription suspected",
  "RO-1: cheaper route available",
  "VH-2: vendor latency spike",
  "SUB-1: recurring vendor identified",
];

const ACTION_TYPES = [
  "auto_block",
  "auto_flag",
  "auto_alert",
  "recommend",
  "auto_route",
] as const;

const SEVERITIES = ["low", "medium", "high"];

// Tiny LCG so we get deterministic-feeling pseudo-randomness inside a
// single mutation (Convex mutations run server-side; Math.random() works
// but we want stable values for the demo).
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export const demo = mutation({
  args: { reseed: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("fleets")
      .withIndex("by_email", (q) => q.eq("email", "demo@rhemify.local"))
      .unique();

    if (existing && !args.reseed) {
      return { status: "already_seeded", fleet_id: existing._id };
    }

    let fleet_id = existing?._id;
    if (!fleet_id) {
      fleet_id = await ctx.db.insert("fleets", {
        email: "demo@rhemify.local",
        company_name: "Rhemos Demo Fleet",
        role: "small-team",
        active_departments: ["ceo", "research", "marketing", "sales", "engineering", "finance"],
        monthly_spend_cap: 1000,
        is_deployed: true,
        // Stable known key so the CLI / TUI / Go server can authenticate
        // against the local anonymous Convex without an onboard flow.
        // The Go server's middleware.FleetAPIKeyAuth resolves this to
        // fleet_id via fleets:getByApiKey. NOT a production secret —
        // local-deployment only.
        api_key: "rhm_demo_local_fleet_key_2026",
      });
    } else if (!existing?.api_key && args.reseed) {
      // Backfill api_key onto a pre-existing demo fleet seeded before Phase N.3.
      await ctx.db.patch(fleet_id, { api_key: "rhm_demo_local_fleet_key_2026" });
    }

    // Insert agents (skip if same agent_key already exists)
    const r = rng(42);
    const agentIds: { id: string; name: string; primary: "mpp" | "x402" }[] = [];
    for (const def of AGENT_DEFS) {
      const existingAgent = await ctx.db
        .query("agents")
        .withIndex("by_agent_key", (q) => q.eq("agent_key", def.key))
        .first();
      const status = (r() < 0.85 ? "running" : "paused") as "running" | "paused";
      let id = existingAgent?._id;
      if (!id) {
        id = await ctx.db.insert("agents", {
          fleet_id,
          agent_key: def.key,
          name: def.name,
          department_id: def.dept,
          status,
          spent_today: Math.round(r() * 200) / 100,
          daily_limit: 5,
          tasks_completed: Math.floor(r() * 100),
          primary_standard: def.primary,
          skills: [def.dept],
          allowed_domains: VENDORS.slice(0, 4),
          allowed_standards: ["x402", "mpp"],
        });
      }
      agentIds.push({ id, name: def.name, primary: def.primary });
    }

    // Insert 30 transactions
    const txStatuses: ("completed" | "blocked" | "pending")[] = [
      "completed", "completed", "completed", "completed",
      "completed", "completed", "blocked", "pending",
    ];
    let txCount = 0;
    for (let i = 0; i < 30; i++) {
      const a = agentIds[Math.floor(r() * agentIds.length)]!;
      const vendor = VENDORS[Math.floor(r() * VENDORS.length)]!;
      const status = txStatuses[Math.floor(r() * txStatuses.length)]!;
      await ctx.db.insert("transactions", {
        fleet_id,
        agent_id: a.id as never,
        agent_name: a.name,
        vendor,
        domain: vendor,
        amount: Math.round(r() * 100) / 100,
        standard: a.primary,
        status,
        blocked_reason: status === "blocked" ? "domain not in allowlist" : undefined,
      });
      txCount++;
    }

    // Insert 12 intelligence actions
    let actionCount = 0;
    for (let i = 0; i < 12; i++) {
      const action_type = ACTION_TYPES[Math.floor(r() * ACTION_TYPES.length)]!;
      const outcomeRoll = r();
      const outcome: "pending" | "applied" | "dismissed" =
        outcomeRoll < 0.4 ? "pending" : outcomeRoll < 0.8 ? "applied" : "dismissed";
      await ctx.db.insert("intelligence_actions", {
        action_type,
        trigger_rule: RULES[Math.floor(r() * RULES.length)]!,
        evidence: { sample: "demo evidence", iteration: i },
        outcome,
        severity: SEVERITIES[Math.floor(r() * SEVERITIES.length)],
        action_detail: "Auto-generated demo action",
        domain: VENDORS[Math.floor(r() * VENDORS.length)],
        fleet_id,
      });
      actionCount++;
    }

    // Insert sample payment_events + matched payment_traces.
    //
    // Each trace carries a full replay_snapshot shaped exactly the way the
    // Go server's replay.Replay() expects (see apps/server/internal/replay/
    // replay.go:64-75 — required keys: policy_state, vendor_registry_snapshot,
    // agent_context). Without this seed, `rhemify traces list` returns an
    // empty table and `rhemify traces replay` has nothing to replay against.
    //
    // Three scenario types interleaved (forced by `i % 3` so deterministic):
    //   - allowed-all-pass  (60% feel — i % 3 in {0,1}): demo "what if tighter?"
    //   - blocked-by-domain (33% feel — i % 3 === 2): demo "what if allowed?"
    //   - flagged-threshold (when amount > approval): allowed but surfaced
    const outcomes: ("success" | "rejected" | "failed")[] = ["success", "success", "success", "rejected", "failed"];

    // The "snapshot" of the policy at decision time. Shared across the seeded
    // traces — in production each fleet has its own; for the demo we want
    // every replay to use the same baseline so override math is predictable.
    const allowlistDomains = ["supabase.com", "stripe.com", "openai.com", "anthropic.com", "github.com"];
    const seedPolicyState = {
      daily_limit: 50,
      max_per_transaction: 5,
      domain_allowlist: allowlistDomains,
      allowed_standards: ["x402", "mpp"],
      approval_threshold: 10,
    };
    const seedVendorSnapshot = VENDORS.reduce<Record<string, { is_blocked: boolean }>>(
      (acc, v) => {
        acc[v] = { is_blocked: false };
        return acc;
      },
      {},
    );

    let traceCount = 0;
    const baseStamp = Date.now();
    for (let i = 0; i < 12; i++) {
      const a = agentIds[Math.floor(r() * agentIds.length)]!;
      const vendor = VENDORS[Math.floor(r() * VENDORS.length)]!;
      const amount = Math.round(r() * 50) / 100;
      const spendToday = Math.round(r() * 30 * 100) / 100;
      const scenario = i % 3; // 0,1 = allowed, 2 = domain block

      const wasBlocked = scenario === 2 && !allowlistDomains.includes(vendor);
      const wasFlagged = !wasBlocked && amount > seedPolicyState.approval_threshold;

      const outcome: "success" | "rejected" | "failed" = wasBlocked
        ? "rejected"
        : outcomes[Math.floor(r() * outcomes.length)]!;

      const traceId = `trc_seed_${baseStamp}_${i}`;

      const eventId = await ctx.db.insert("payment_events", {
        agent_id: a.id,
        fleet_id,
        standard: a.primary,
        amount,
        token: "USDC",
        chain: "solana-devnet",
        domain: vendor,
        outcome,
        instrument_type: "ows",
        trace_id: traceId,
      });

      const policyRulesFired = [
        {
          rule: "daily_limit",
          result: spendToday + amount > seedPolicyState.daily_limit ? "block" : "pass",
          threshold: seedPolicyState.daily_limit.toFixed(2),
          value: (spendToday + amount).toFixed(2),
        },
        {
          rule: "max_per_transaction",
          result: amount > seedPolicyState.max_per_transaction ? "block" : "pass",
          threshold: seedPolicyState.max_per_transaction.toFixed(2),
          value: amount.toFixed(2),
        },
        {
          rule: "domain_allowlist",
          result: wasBlocked ? "block" : "pass",
          threshold: "allowlist",
          value: vendor,
        },
        {
          rule: "standard_allowlist",
          result: "pass",
          threshold: "allowlist",
          value: a.primary,
        },
        {
          rule: "vendor_blocked",
          result: "pass",
          threshold: "not_blocked",
          value: vendor,
        },
        {
          rule: "approval_threshold",
          result: wasFlagged ? "flag" : "pass",
          threshold: seedPolicyState.approval_threshold.toFixed(2),
          value: amount.toFixed(2),
        },
      ];

      await ctx.db.insert("payment_traces", {
        payment_event_id: eventId,
        trace_id: traceId,
        agent_task_context: `${a.name} called ${vendor} ($${amount.toFixed(2)} ${a.primary})`,
        trigger_402_raw: `HTTP 402 from ${vendor}: payment required (${a.primary} challenge)`,
        alternatives_evaluated: [
          { instrument: "credit", available: false, reason: "no credit service configured" },
          { instrument: "ows", available: true, score: 0.95, estimated_cost: amount + 0.001 },
          { instrument: "jupiter", available: false, reason: "USDC matches vendor" },
        ],
        policy_rules_fired: policyRulesFired,
        instrument_selection_log: {
          selected: wasBlocked ? "none" : "ows",
          reason: wasBlocked ? "domain blocked by policy" : "lowest cost path",
        },
        confidence: wasBlocked ? "high" : amount > 5 ? "medium" : "high",
        replay_snapshot: {
          policy_state: seedPolicyState,
          vendor_registry_snapshot: seedVendorSnapshot,
          agent_context: { spend_today: spendToday },
        },
        trace_hash: `sha256_seed_${i}_${baseStamp.toString(16)}`,
      });
      traceCount++;
    }

    return {
      status: "seeded",
      fleet_id,
      agents: agentIds.length,
      transactions: txCount,
      intelligence_actions: actionCount,
      payment_traces: traceCount,
    };
  },
});
