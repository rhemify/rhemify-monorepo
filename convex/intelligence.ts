import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Records an intelligence action taken by the rules engine.
export const insertAction = mutation({
  args: {
    action_type: v.string(),
    severity: v.string(),
    trigger_rule: v.string(),
    trigger_event_id: v.optional(v.string()),
    evidence: v.any(),
    action_detail: v.string(),
    agent_id: v.optional(v.string()),
    domain: v.optional(v.string()),
    fleet_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("intelligence_actions", {
      action_type: args.action_type,
      trigger_rule: args.trigger_rule,
      evidence: args.evidence,
      outcome: "pending",
      severity: args.severity,
      action_detail: args.action_detail,
      agent_id: args.agent_id,
      domain: args.domain,
      fleet_id: args.fleet_id,
      trigger_event_id: args.trigger_event_id,
    });
  },
});
