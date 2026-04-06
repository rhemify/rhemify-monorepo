import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByAgent = query({
  args: { agent_id: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("policies")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .unique();
  },
});

// GET /api/policy/:agentId — policy + aggregates for SDK PolicyEngine
export const getWithContext = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    // Find agent by agent_key
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_key", (q) => q.eq("agent_key", args.agent_id))
      .unique();

    if (!agent) {
      // Return permissive defaults if agent not found
      return {
        policy: {
          dailyLimit: 100,
          maxPerTransaction: 50,
          approvalThreshold: 0,
          allowedStandards: [],
          domainAllowlist: [],
        },
        spentToday: 0,
        blockedDomains: [],
      };
    }

    // Get policy
    const policy = await ctx.db
      .query("policies")
      .withIndex("by_agent", (q) => q.eq("agent_id", agent._id))
      .unique();

    // Calculate today's spend from payment_events
    const todayEvents = await ctx.db
      .query("payment_events")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .collect();

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const spentToday = todayEvents
      .filter((e) => e._creationTime >= todayMs && e.outcome === "success")
      .reduce((sum, e) => sum + e.amount, 0);

    // Get blocked domains from vendor_registry
    const blockedVendors = await ctx.db
      .query("vendor_registry")
      .collect();
    const blockedDomains = blockedVendors
      .filter((v) => {
        const data = v as Record<string, unknown>;
        return data.is_blocked === true || (data.success_rate as number) < 0.5;
      })
      .map((v) => v.domain);

    return {
      policy: policy
        ? {
            dailyLimit: policy.daily_limit,
            maxPerTransaction: policy.max_per_transaction,
            approvalThreshold: policy.approval_threshold,
            allowedStandards: policy.allowed_standards,
            domainAllowlist: policy.domain_allowlist,
          }
        : {
            dailyLimit: agent.daily_limit,
            maxPerTransaction: 50,
            approvalThreshold: 0,
            allowedStandards: agent.allowed_standards,
            domainAllowlist: agent.allowed_domains,
          },
      spentToday,
      blockedDomains,
    };
  },
});

// POST /api/policy/:agentId — upsert agent policy
export const upsert = mutation({
  args: {
    agent_id: v.string(),
    daily_limit: v.optional(v.float64()),
    max_per_transaction: v.optional(v.float64()),
    approval_threshold: v.optional(v.float64()),
    allowed_standards: v.optional(v.array(v.string())),
    domain_allowlist: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Find agent
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agent_key", (q) => q.eq("agent_key", args.agent_id))
      .unique();

    if (!agent) {
      throw new Error(`Agent not found: ${args.agent_id}`);
    }

    const existing = await ctx.db
      .query("policies")
      .withIndex("by_agent", (q) => q.eq("agent_id", agent._id))
      .unique();

    const updates: Record<string, unknown> = {};
    if (args.daily_limit !== undefined) updates.daily_limit = args.daily_limit;
    if (args.max_per_transaction !== undefined) updates.max_per_transaction = args.max_per_transaction;
    if (args.approval_threshold !== undefined) updates.approval_threshold = args.approval_threshold;
    if (args.allowed_standards !== undefined) updates.allowed_standards = args.allowed_standards;
    if (args.domain_allowlist !== undefined) updates.domain_allowlist = args.domain_allowlist;

    if (existing) {
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("policies", {
      agent_id: agent._id,
      daily_limit: args.daily_limit ?? 100,
      max_per_transaction: args.max_per_transaction ?? 50,
      approval_threshold: args.approval_threshold ?? 0,
      allowed_standards: args.allowed_standards ?? [],
      domain_allowlist: args.domain_allowlist ?? [],
    });
  },
});

export const update = mutation({
  args: {
    agent_id: v.id("agents"),
    daily_limit: v.optional(v.float64()),
    max_per_transaction: v.optional(v.float64()),
    approval_threshold: v.optional(v.float64()),
    allowed_standards: v.optional(v.array(v.string())),
    domain_allowlist: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const policy = await ctx.db
      .query("policies")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .unique();

    if (!policy) return null;

    const { agent_id: _, ...updates } = args;
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }

    await ctx.db.patch(policy._id, cleanUpdates);
    return policy._id;
  },
});

// Insert a policy decision record (called by Go server after ingest)
export const insertDecision = mutation({
  args: {
    payment_event_id: v.optional(v.id("payment_events")),
    agent_id: v.optional(v.string()),
    rule_triggered: v.string(),
    decision: v.string(),
    threshold: v.string(),
    actual_value: v.string(),
    domain: v.string(),
    standard: v.string(),
  },
  handler: async (ctx, args) => {
    // Find matching event by agent+domain if payment_event_id not provided
    let eventId = args.payment_event_id;
    if (!eventId && args.agent_id) {
      const recentEvents = await ctx.db
        .query("payment_events")
        .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id!))
        .order("desc")
        .take(1);
      eventId = recentEvents[0]?._id;
    }

    if (!eventId) {
      // Skip inserting if we can't link to an event
      return null;
    }

    return await ctx.db.insert("policy_decisions", {
      payment_event_id: eventId,
      agent_id: args.agent_id ?? "",
      rule_triggered: args.rule_triggered,
      decision: args.decision,
      threshold: args.threshold,
      actual_value: args.actual_value,
      domain: args.domain,
      standard: args.standard,
    });
  },
});
