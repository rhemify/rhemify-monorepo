import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useFleetId } from "@/lib/convex";
import { getDepartment } from "@/lib/templates";
import type { Agent, PaymentStandard } from "@/lib/types";
import type { Id } from "@convex/_generated/dataModel";

function mapAgent(doc: {
  _id: Id<"agents">;
  agent_key: string;
  name: string;
  department_id: string;
  status: string;
  spent_today: number;
  daily_limit: number;
  tasks_completed: number;
  primary_standard: string;
  skills: string[];
  allowed_domains: string[];
  allowed_standards: string[];
}): Agent {
  const dept = getDepartment(doc.department_id);
  return {
    id: doc._id,
    name: doc.name,
    department: dept ?? {
      id: doc.department_id,
      name: doc.department_id,
      icon: "?",
      defaultSkills: [],
      alwaysOn: false,
      pricePerMonth: 0,
    },
    status: doc.status as Agent["status"],
    spentToday: doc.spent_today,
    dailyLimit: doc.daily_limit,
    tasksCompleted: doc.tasks_completed,
    primaryStandard: doc.primary_standard as PaymentStandard,
    skills: doc.skills,
    allowedDomains: doc.allowed_domains,
    allowedStandards: doc.allowed_standards as PaymentStandard[],
  };
}

export function useAgents() {
  const fleetId = useFleetId();
  const data = useQuery(api.agents.list, fleetId ? { fleet_id: fleetId } : "skip");

  return {
    data: data?.map(mapAgent),
    isLoading: data === undefined,
  };
}

export function useAgent(id: string) {
  const data = useQuery(api.agents.get, { id: id as Id<"agents"> });

  return {
    data: data ? mapAgent(data) : undefined,
    isLoading: data === undefined,
  };
}
