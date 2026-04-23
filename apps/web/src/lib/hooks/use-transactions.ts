import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useFleetId } from "@/lib/convex";
import type { Transaction, PaymentStandard } from "@/lib/types";
import type { Id } from "@convex/_generated/dataModel";

type TxDoc = {
  _id: Id<"transactions">;
  _creationTime: number;
  agent_id: Id<"agents">;
  agent_name: string;
  vendor: string;
  domain: string;
  amount: number;
  standard: string;
  status: string;
  blocked_reason?: string;
};

function mapTransaction(doc: TxDoc): Transaction {
  return {
    id: doc._id,
    agentId: doc.agent_id,
    agentName: doc.agent_name,
    vendor: doc.vendor,
    domain: doc.domain,
    amount: doc.amount,
    standard: doc.standard as PaymentStandard,
    status: doc.status as Transaction["status"],
    blockedReason: doc.blocked_reason,
    timestamp: new Date(doc._creationTime),
  };
}

export function useTransactions(limit = 50) {
  const fleetId = useFleetId();
  const data = useQuery(api.transactions.list, fleetId ? { fleet_id: fleetId, limit } : "skip");

  return {
    data: data?.map(mapTransaction),
    isLoading: data === undefined,
  };
}

export function useAgentTransactions(agentId: string, limit = 20) {
  const data = useQuery(api.transactions.listByAgent, {
    agent_id: agentId as Id<"agents">,
    limit,
  });

  return {
    data: data?.map(mapTransaction),
    isLoading: data === undefined,
  };
}
