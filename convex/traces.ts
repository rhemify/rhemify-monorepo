import { query } from "./_generated/server";
import { v } from "convex/values";

// GET /api/traces/:id
export const get = query({
  args: { id: v.id("payment_traces") },
  handler: async (ctx, args) => {
    const trace = await ctx.db.get(args.id);
    if (!trace) return null;

    const event = await ctx.db.get(trace.payment_event_id);

    return {
      ...trace,
      payment_event: event,
    };
  },
});
