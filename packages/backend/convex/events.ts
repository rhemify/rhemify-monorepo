import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { PaymentStandard, PaymentOutcome } from "./schema";

// GET /api/events — paginated, filterable
export const list = query({
  args: {
    fleet_id: v.string(),
    limit: v.optional(v.float64()),
    cursor: v.optional(v.string()),
    agent_id: v.optional(v.string()),
    outcome: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let q;
    if (args.agent_id) {
      q = ctx.db
        .query("payment_events")
        .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id!));
    } else {
      q = ctx.db
        .query("payment_events")
        .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id));
    }

    let events = await q.order("desc").take(limit + 1);

    if (args.outcome) {
      events = events.filter((e) => e.outcome === args.outcome);
    }

    const hasMore = events.length > limit;
    const data = events.slice(0, limit);

    return {
      data,
      has_more: hasMore,
    };
  },
});

// POST /api/ingest/payment — insert a payment event (called by Go server)
export const insert = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("payment_events", args);
    return id;
  },
});

// GET /api/events/:id — single event with linked trace
export const get = query({
  args: { id: v.id("payment_events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) return null;

    const traces = await ctx.db
      .query("payment_traces")
      .withIndex("by_payment_event", (q) => q.eq("payment_event_id", args.id))
      .collect();

    const decisions = await ctx.db
      .query("policy_decisions")
      .withIndex("by_payment_event", (q) => q.eq("payment_event_id", args.id))
      .collect();

    return {
      ...event,
      trace: traces[0] ?? null,
      policy_decisions: decisions,
    };
  },
});
