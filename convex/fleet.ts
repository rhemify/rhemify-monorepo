import { query } from "./_generated/server";
import { v } from "convex/values";

// GET /api/fleet/stats
export const getStats = query({
  args: { fleet_id: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("payment_events")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();

    const now = Date.now();
    const startOfDay = now - (now % 86_400_000);

    const todayEvents = events.filter((e) => e._creationTime >= startOfDay);
    const successToday = todayEvents.filter((e) => e.outcome === "success");
    const blockedToday = todayEvents.filter((e) => e.outcome === "rejected");

    return {
      total_events: events.length,
      events_today: todayEvents.length,
      total_spent_today: successToday.reduce((sum, e) => sum + e.amount, 0),
      blocked_events: blockedToday.length,
    };
  },
});

// GET /api/fleet/agents — list all agents with spend summaries
export const listAgents = query({
  args: { fleet_id: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("payment_events")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();

    const now = Date.now();
    const startOfDay = now - (now % 86_400_000);

    // Group by agent
    const agentMap = new Map<
      string,
      { spent_today: number; tasks_completed: number; blocked: number }
    >();

    for (const event of events) {
      const entry = agentMap.get(event.agent_id) ?? {
        spent_today: 0,
        tasks_completed: 0,
        blocked: 0,
      };

      if (event._creationTime >= startOfDay) {
        if (event.outcome === "success") {
          entry.spent_today += event.amount;
          entry.tasks_completed += 1;
        } else if (event.outcome === "rejected") {
          entry.blocked += 1;
        }
      }

      agentMap.set(event.agent_id, entry);
    }

    return Array.from(agentMap.entries()).map(([agent_id, stats]) => ({
      agent_id,
      ...stats,
    }));
  },
});

// GET /api/fleet/agents/:id — single agent detail
export const getAgent = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("payment_events")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .collect();

    const now = Date.now();
    const startOfDay = now - (now % 86_400_000);
    const todayEvents = events.filter((e) => e._creationTime >= startOfDay);

    return {
      agent_id: args.agent_id,
      total_events: events.length,
      spent_today: todayEvents
        .filter((e) => e.outcome === "success")
        .reduce((sum, e) => sum + e.amount, 0),
      tasks_completed: todayEvents.filter((e) => e.outcome === "success")
        .length,
      blocked_today: todayEvents.filter((e) => e.outcome === "rejected")
        .length,
    };
  },
});
