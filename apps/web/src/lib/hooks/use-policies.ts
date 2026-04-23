import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Policy } from "@/lib/types";
import type { PaymentStandard } from "@/lib/types";
import type { Id } from "@convex/_generated/dataModel";

export function usePolicies(agentId: string) {
  const data = useQuery(api.policies.getByAgent, {
    agent_id: agentId as Id<"agents">,
  });

  const mapped: Policy | undefined = data
    ? {
        agentId: data.agent_id,
        dailyLimit: data.daily_limit,
        maxPerTransaction: data.max_per_transaction,
        approvalThreshold: data.approval_threshold,
        allowedStandards: data.allowed_standards as PaymentStandard[],
        domainAllowlist: data.domain_allowlist,
      }
    : undefined;

  return { data: mapped, isLoading: data === undefined };
}

export function useUpdatePolicy() {
  const updatePolicy = useMutation(api.policies.update);

  return {
    mutate: ({ agentId, updates }: { agentId: string; updates: Partial<Policy> }) => {
      const args: Record<string, unknown> = {
        agent_id: agentId as Id<"agents">,
      };
      if (updates.dailyLimit !== undefined) args.daily_limit = updates.dailyLimit;
      if (updates.maxPerTransaction !== undefined)
        args.max_per_transaction = updates.maxPerTransaction;
      if (updates.approvalThreshold !== undefined)
        args.approval_threshold = updates.approvalThreshold;
      if (updates.allowedStandards !== undefined) args.allowed_standards = updates.allowedStandards;
      if (updates.domainAllowlist !== undefined) args.domain_allowlist = updates.domainAllowlist;

      return updatePolicy(args as Parameters<typeof updatePolicy>[0]);
    },
  };
}
