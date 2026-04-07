import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Upsert a wallet balance (called by Go server balance syncer)
export const upsert = mutation({
  args: {
    dwallet_id: v.string(),
    chain: v.string(),
    token: v.string(),
    amount: v.float64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("wallet_balances")
      .withIndex("by_dwallet_chain", (q) =>
        q.eq("dwallet_id", args.dwallet_id).eq("chain", args.chain)
      )
      .filter((q) => q.eq(q.field("token"), args.token))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        amount: args.amount,
        last_synced_at: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("wallet_balances", {
      ...args,
      last_synced_at: Date.now(),
    });
  },
});

// Get all balances for a dWallet
export const getByDwallet = query({
  args: { dwallet_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("wallet_balances")
      .withIndex("by_dwallet", (q) => q.eq("dwallet_id", args.dwallet_id))
      .collect();
  },
});
