import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Create a new signing request (called by Go server signing handler)
export const create = mutation({
  args: {
    fleet_id: v.id("fleets"),
    agent_key: v.string(),
    dwallet_id: v.string(),
    target_chain: v.string(),
    target_address: v.string(),
    token: v.string(),
    amount: v.float64(),
    status: v.string(),
    created_at: v.float64(),
  },
  handler: async (ctx, args) => {
    // Resolve agent_id from fleet + agent_key
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .filter((q) => q.eq(q.field("agent_key"), args.agent_key))
      .unique();

    const { agent_key: _, ...rest } = args;
    const id = await ctx.db.insert("signing_requests", {
      ...rest,
      agent_id: agent?._id,
    });
    return id;
  },
});

// Valid state transitions for signing requests
const validTransitions: Record<string, string[]> = {
  pending: ["approved", "rejected", "failed"],
  approved: ["signed", "failed"],
  signed: ["broadcast", "failed"],
  broadcast: ["confirmed", "failed"],
}

// Update signing request status with transition validation
export const updateStatus = mutation({
  args: {
    request_id: v.id("signing_requests"),
    status: v.string(),
    rejection_reason: v.optional(v.string()),
    ika_signature: v.optional(v.string()),
    target_tx_hash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.request_id);
    if (!existing) throw new Error("signing request not found");

    // Validate state transition
    const allowed = validTransitions[existing.status];
    if (!allowed || !allowed.includes(args.status)) {
      throw new Error(`invalid transition: ${existing.status} → ${args.status}`);
    }

    const { request_id, ...updates } = args;
    const patch: Record<string, unknown> = { status: updates.status };

    if (updates.rejection_reason !== undefined) {
      patch.rejection_reason = updates.rejection_reason;
    }
    if (updates.ika_signature !== undefined) {
      patch.ika_signature = updates.ika_signature;
    }
    if (updates.target_tx_hash !== undefined) {
      patch.target_tx_hash = updates.target_tx_hash;
    }

    // Set resolved_at for terminal states
    const terminalStates = ["confirmed", "rejected", "failed"];
    if (terminalStates.includes(updates.status)) {
      patch.resolved_at = Date.now();
    }

    await ctx.db.patch(request_id, patch);
    return request_id;
  },
});

// Get a signing request by ID
export const get = query({
  args: { request_id: v.id("signing_requests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.request_id);
  },
});

// List signing requests by fleet
export const listByFleet = query({
  args: {
    fleet_id: v.id("fleets"),
    limit: v.optional(v.float64()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let requests;
    if (args.status) {
      requests = await ctx.db
        .query("signing_requests")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
      // Filter to fleet after index query
      requests = requests.filter((r) => r.fleet_id === args.fleet_id);
    } else {
      requests = await ctx.db
        .query("signing_requests")
        .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
        .order("desc")
        .take(limit);
    }

    return requests;
  },
});

// List signing requests by agent
export const listByAgent = query({
  args: {
    agent_id: v.id("agents"),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("signing_requests")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .order("desc")
      .take(args.limit ?? 50);
  },
});
