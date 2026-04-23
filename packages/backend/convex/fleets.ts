import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { id: v.id("fleets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fleets")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const create = mutation({
  args: {
    email: v.string(),
    company_name: v.string(),
    role: v.string(),
    active_departments: v.array(v.string()),
    monthly_spend_cap: v.float64(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("fleets", {
      ...args,
      is_deployed: false,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("fleets"),
    email: v.optional(v.string()),
    company_name: v.optional(v.string()),
    role: v.optional(v.string()),
    active_departments: v.optional(v.array(v.string())),
    monthly_spend_cap: v.optional(v.float64()),
    is_deployed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    // Filter out undefined values
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }
    await ctx.db.patch(id, cleanUpdates);
  },
});
