import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useFleetId } from "@/lib/convex";
import type { FleetStats } from "@/lib/types";

export function useFleetStats() {
  const fleetId = useFleetId();
  const data = useQuery(api.fleet.getStats, fleetId ? { fleet_id: fleetId } : "skip");

  const mapped: FleetStats | undefined = data
    ? {
        activeAgents: data.active_agents,
        totalAgents: data.total_agents,
        spentToday: data.spent_today,
        spentYesterday: data.spent_yesterday,
        tasksCompleted: data.tasks_completed,
        blockedAgents: data.blocked_agents,
      }
    : undefined;

  return { data: mapped, isLoading: data === undefined };
}
