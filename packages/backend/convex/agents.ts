import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { AgentStatus } from "./schema";

const DEFAULT_DOMAINS: Record<string, string[]> = {
  ceo: ["notion.so", "slack.com"],
  research: ["perplexity.ai", "statista.com", "bloomberg.com"],
  marketing: ["canva.com", "figma.com", "unsplash.com"],
  sales: ["apollo.io", "linkedin.com", "clearbit.com"],
  engineering: ["github.com", "sentry.io", "datadog.com"],
  finance: ["stripe.com", "quickbooks.com", "plaid.com"],
};

const DEFAULT_STANDARDS: Record<string, "mpp" | "x402" | "l402" | "ap2"> = {
  ceo: "mpp",
  research: "x402",
  marketing: "mpp",
  sales: "x402",
  engineering: "x402",
  finance: "mpp",
};

const DEPARTMENT_SKILLS: Record<string, string[]> = {
  ceo: ["orchestration", "delegation", "oversight"],
  research: ["web_search", "pdf_extract", "data_feeds"],
  marketing: ["copy_gen", "ad_creative", "social"],
  sales: ["lead_enrich", "crm_sync", "outreach"],
  engineering: ["github_alerts", "triage", "security"],
  finance: ["reconcile", "invoicing", "expense"],
};

export const list = query({
  args: { fleet_id: v.id("fleets") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();
  },
});

// Read-all helper consumed by the TUI dashboard (apps/tui/). Scoped to
// observability surfaces — not for app-tier paths that should always
// be fleet-scoped.
export const listAll = query({
  args: { limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("agents").collect();
    return args.limit ? all.slice(0, args.limit) : all;
  },
});

export const get = query({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByKey = query({
  args: { agent_key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_agent_key", (q) => q.eq("agent_key", args.agent_key))
      .unique();
  },
});

export const deploy = mutation({
  args: {
    fleet_id: v.id("fleets"),
    department_ids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const agentIds = [];

    for (const deptId of args.department_ids) {
      const agentKey = `${deptId}-001`;
      const isAlwaysOn = deptId === "ceo";
      const domains = DEFAULT_DOMAINS[deptId] ?? [];
      const primary = DEFAULT_STANDARDS[deptId] ?? "mpp";
      const skills = DEPARTMENT_SKILLS[deptId] ?? [];

      const agentId = await ctx.db.insert("agents", {
        fleet_id: args.fleet_id,
        agent_key: agentKey,
        name: deptId.charAt(0).toUpperCase() + deptId.slice(1),
        department_id: deptId,
        status: "running",
        spent_today: 0,
        daily_limit: isAlwaysOn ? 1 : 5,
        tasks_completed: 0,
        primary_standard: primary,
        skills,
        allowed_domains: domains,
        allowed_standards: ["mpp", "x402", "l402"],
      });

      await ctx.db.insert("policies", {
        agent_id: agentId,
        daily_limit: isAlwaysOn ? 1 : 5,
        max_per_transaction: 1,
        approval_threshold: 5,
        allowed_standards: ["mpp", "x402", "l402"],
        domain_allowlist: domains,
      });

      agentIds.push(agentId);
    }

    // Mark fleet as deployed
    await ctx.db.patch(args.fleet_id, { is_deployed: true });

    return agentIds;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("agents"),
    status: AgentStatus,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const killSwitch = mutation({
  args: { fleet_id: v.id("fleets") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();

    for (const agent of agents) {
      await ctx.db.patch(agent._id, { status: "frozen" });
    }
  },
});
