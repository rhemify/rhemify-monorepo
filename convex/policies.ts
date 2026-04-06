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
