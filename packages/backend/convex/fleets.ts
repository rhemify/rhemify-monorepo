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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated: must be signed in to create a fleet");
    }
    return await ctx.db.insert("fleets", {
      ...args,
      is_deployed: false,
      ownerUserId: identity.subject,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated: must be signed in to update a fleet");
    }
    const fleet = await ctx.db.get(args.id);
    if (!fleet) {
      throw new Error("Fleet not found");
    }
    if (fleet.ownerUserId !== identity.subject) {
      throw new Error("Unauthorized: not the fleet owner");
    }
    const { id, ...updates } = args;
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }
    await ctx.db.patch(id, cleanUpdates);
  },
});
