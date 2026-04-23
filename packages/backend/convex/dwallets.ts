import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const dwalletType = v.union(v.literal("treasury"), v.literal("agent"));
const dwalletStatus = v.union(
  v.literal("creating"),
  v.literal("active"),
  v.literal("frozen"),
  v.literal("revoked"),
);

// Insert a new dWallet into the registry
export const insert = mutation({
  args: {
    fleet_id: v.id("fleets"),
    agent_id: v.optional(v.id("agents")),
    dwallet_type: dwalletType,
    dwallet_id: v.string(),
    dwallet_cap_id: v.string(),
    supported_chains: v.array(v.string()),
    status: dwalletStatus,
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("dwallet_registry", {
      ...args,
      created_at: Date.now(),
    });
    return id;
  },
});

// Aliases used by Go server handler
export const createFleetVault = mutation({
  args: {
    fleet_id: v.id("fleets"),
    dwallet_type: dwalletType,
    dwallet_id: v.string(),
    dwallet_cap_id: v.string(),
    supported_chains: v.array(v.string()),
    status: dwalletStatus,
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("dwallet_registry", {
      ...args,
      created_at: Date.now(),
    });
    return id;
  },
});

export const createAgentWallet = mutation({
  args: {
    fleet_id: v.id("fleets"),
    agent_key: v.string(),
    dwallet_type: dwalletType,
    dwallet_id: v.string(),
    dwallet_cap_id: v.string(),
    supported_chains: v.array(v.string()),
    status: dwalletStatus,
  },
  handler: async (ctx, args) => {
    // Find the agent by fleet + key to get agent_id
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .filter((q) => q.eq(q.field("agent_key"), args.agent_key))
      .unique();

    const { agent_key: _, ...rest } = args;
    const id = await ctx.db.insert("dwallet_registry", {
      ...rest,
      agent_id: agent?._id,
      created_at: Date.now(),
    });
    return id;
  },
});

// Update dWallet status (e.g., creating -> active, active -> frozen)
export const updateStatus = mutation({
  args: {
    fleet_id: v.id("fleets"),
    agent_key: v.optional(v.string()),
    status: dwalletStatus,
  },
  handler: async (ctx, args) => {
    const wallets = await ctx.db
      .query("dwallet_registry")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();

    for (const wallet of wallets) {
      if (args.agent_key) {
        // Find the agent to match
        if (wallet.agent_id) {
          const agent = await ctx.db.get(wallet.agent_id);
          if (agent && agent.agent_key === args.agent_key) {
            await ctx.db.patch(wallet._id, { status: args.status });
            return wallet._id;
          }
        }
      } else if (wallet.dwallet_type === "treasury") {
        await ctx.db.patch(wallet._id, { status: args.status });
        return wallet._id;
      }
    }
    return null;
  },
});

// List all dWallets for a fleet
export const listByFleet = query({
  args: { fleet_id: v.id("fleets") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dwallet_registry")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();
  },
});

// Get a specific agent wallet
export const getAgentWallet = query({
  args: {
    fleet_id: v.id("fleets"),
    agent_key: v.string(),
  },
  handler: async (ctx, args) => {
    const wallets = await ctx.db
      .query("dwallet_registry")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();

    for (const wallet of wallets) {
      if (wallet.agent_id) {
        const agent = await ctx.db.get(wallet.agent_id);
        if (agent && agent.agent_key === args.agent_key) {
          return { ...wallet, agent };
        }
      }
    }
    return null;
  },
});

// Get dWallet by Ika dWallet ID
export const getByDwalletId = query({
  args: { dwallet_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dwallet_registry")
      .withIndex("by_dwallet", (q) => q.eq("dwallet_id", args.dwallet_id))
      .unique();
  },
});
