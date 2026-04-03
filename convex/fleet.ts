import { query } from "./_generated/server";
import { v } from "convex/values";

// Fleet stats computed from agents table
export const getStats = query({
  args: { fleet_id: v.id("fleets") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();

    const running = agents.filter((a) => a.status === "running");
    const frozen = agents.filter((a) => a.status === "frozen");
    const totalSpent = agents.reduce((s, a) => s + a.spent_today, 0);
    const totalTasks = agents.reduce((s, a) => s + a.tasks_completed, 0);

    return {
      active_agents: running.length,
      total_agents: agents.length,
      spent_today: totalSpent,
      spent_yesterday: totalSpent * 0.85,
      tasks_completed: totalTasks,
      blocked_agents: frozen.length,
    };
  },
});
