import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { PaymentStandard, TransactionStatus } from "./schema";

// Read-all helper consumed by the TUI dashboard. Newest first.
export const listAll = query({
  args: { limit: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 30;
    return await ctx.db.query("transactions").order("desc").take(limit);
  },
});

export const list = query({
  args: {
    fleet_id: v.id("fleets"),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("transactions")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .order("desc")
      .take(limit);
  },
});

export const listByAgent = query({
  args: {
    agent_id: v.id("agents"),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("transactions")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .order("desc")
      .take(limit);
  },
});

export const add = mutation({
  args: {
    fleet_id: v.id("fleets"),
    agent_id: v.id("agents"),
    agent_name: v.string(),
    vendor: v.string(),
    domain: v.string(),
    amount: v.float64(),
    standard: PaymentStandard,
    status: TransactionStatus,
    blocked_reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const txId = await ctx.db.insert("transactions", args);

    // Update agent stats if completed
    if (args.status === "completed") {
      const agent = await ctx.db.get(args.agent_id);
      if (agent) {
        await ctx.db.patch(args.agent_id, {
          spent_today: agent.spent_today + args.amount,
          tasks_completed: agent.tasks_completed + 1,
        });
      }
    }

    return txId;
  },
});
