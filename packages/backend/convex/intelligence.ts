import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { IntelligenceActionType, IntelligenceOutcome } from "./schema";

// ============================================================================
// FRONTEND QUERIES — @junshen these are ready for the dashboard
//
// Intelligence Feed:    useQuery(api.intelligence.listActions, { fleet_id })
// Action Detail:        useQuery(api.intelligence.getAction, { id })
// Active Alert Count:   useQuery(api.intelligence.countActive, { fleet_id })
//
// Operator Actions:
//   useMutation(api.intelligence.dismissAction, { id, note })
//   useMutation(api.intelligence.reverseAction, { id, note })
//
// See docs/superpowers/specs/2026-04-08-rules-engine-design.md for context.
// ============================================================================

// List intelligence actions for the Intelligence Feed panel.
// Returns most recent first. Filter by action_type or severity.
export const listActions = query({
  args: {
    fleet_id: v.optional(v.string()),
    action_type: v.optional(IntelligenceActionType),
    outcome: v.optional(IntelligenceOutcome),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let actions;
    if (args.action_type) {
      actions = await ctx.db
        .query("intelligence_actions")
        .withIndex("by_action_type", (q) => q.eq("action_type", args.action_type!))
        .order("desc")
        .take(limit);
    } else if (args.outcome) {
      actions = await ctx.db
        .query("intelligence_actions")
        .withIndex("by_outcome", (q) => q.eq("outcome", args.outcome!))
        .order("desc")
        .take(limit);
    } else {
      actions = await ctx.db.query("intelligence_actions").order("desc").take(limit);
    }

    // Post-filter by fleet_id if provided (no compound index available)
    if (args.fleet_id) {
      actions = actions.filter((a) => a.fleet_id === args.fleet_id);
    }

    return actions;
  },
});

// Get a single intelligence action with full evidence.
export const getAction = query({
  args: { id: v.id("intelligence_actions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Count active (non-resolved) actions for badge/notification count.
// Active = outcome is "pending" (not dismissed/reversed/applied).
export const countActive = query({
  args: { fleet_id: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("intelligence_actions")
      .withIndex("by_outcome", (q) => q.eq("outcome", "pending"))
      .collect();

    if (args.fleet_id) {
      return pending.filter((a) => a.fleet_id === args.fleet_id).length;
    }
    return pending.length;
  },
});

// Operator dismisses an alert (acknowledges it, no further action needed).
export const dismissAction = mutation({
  args: {
    id: v.id("intelligence_actions"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.id);
    if (!action) throw new Error("Action not found");
    if (action.outcome !== "pending") {
      throw new Error(`Cannot dismiss action with outcome: ${action.outcome}`);
    }

    await ctx.db.patch(args.id, {
      outcome: "dismissed",
      operator_override: "dismissed",
      resolved_at: Date.now(),
    });
  },
});

// Operator reverses an auto-action (e.g., unblocks a vendor that VH-1 blocked).
export const reverseAction = mutation({
  args: {
    id: v.id("intelligence_actions"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.id);
    if (!action) throw new Error("Action not found");
    if (action.outcome !== "pending") {
      throw new Error(`Cannot reverse action with outcome: ${action.outcome}`);
    }

    await ctx.db.patch(args.id, {
      outcome: "reversed",
      operator_override: "reversed",
      resolved_at: Date.now(),
    });

    // If this was a vendor auto-block, unblock the vendor
    if (action.action_type === "auto_block" && action.domain) {
      const vendor = await ctx.db
        .query("vendor_registry")
        .withIndex("by_domain", (q) => q.eq("domain", action.domain!))
        .unique();

      if (vendor && vendor.is_blocked) {
        await ctx.db.patch(vendor._id, {
          is_blocked: false,
          blocked_reason: undefined,
          blocked_until: undefined,
        });
      }
    }
  },
});

// ============================================================================
// INTERNAL — called only by Go server
// ============================================================================

// Records an intelligence action taken by the rules engine.
export const insertAction = internalMutation({
  args: {
    action_type: IntelligenceActionType,
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
