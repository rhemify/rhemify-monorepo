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
      });
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

    // Insert sample payment_events (for the live feed) — already have one
    // from earlier test; add a few more variety
    const outcomes: ("success" | "rejected" | "failed")[] = ["success", "success", "success", "rejected", "failed"];
    for (let i = 0; i < 10; i++) {
      const a = agentIds[Math.floor(r() * agentIds.length)]!;
      const vendor = VENDORS[Math.floor(r() * VENDORS.length)]!;
      await ctx.db.insert("payment_events", {
        agent_id: a.id,
        fleet_id,
        standard: a.primary,
        amount: Math.round(r() * 50) / 100,
        token: "USDC",
        chain: "solana-devnet",
        domain: vendor,
        outcome: outcomes[Math.floor(r() * outcomes.length)]!,
        instrument_type: "ows",
        trace_id: `trc_demo_${Date.now()}_${i}`,
      });
    }

    return {
      status: "seeded",
      fleet_id,
      agents: agentIds.length,
      transactions: txCount,
      intelligence_actions: actionCount,
    };
  },
});
