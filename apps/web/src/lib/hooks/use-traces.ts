import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Decision-trace queries — the audit-payment-rail surface backing
 * `/dashboard/traces` and `/dashboard/traces/$traceId`. Pure read hooks
 * over Convex `payment_traces` + linked `payment_events`. Mirrors the data
 * shape the `rhemify traces list/show` CLI commands already render, so the
 * dashboard and the CLI share a single source of truth.
 */

/** Row shape returned by `traces:listAll` — keep in sync with `convex/traces.ts`. */
export interface TraceListRow {
  _id: string;
  trace_id: string;
  _creationTime: number;
  confidence: "high" | "medium" | "low";
  decision: "allowed" | "blocked";
  agent_id: string | null;
  domain: string | null;
  amount: number | null;
  standard: string | null;
  outcome: string | null;
  anchor_tx_hash: string | null;
}

/** Detail shape returned by `traces:getByTraceId` — full audit context. */
export interface PolicyRule {
  rule: string;
  result?: "pass" | "block" | "flag" | "skipped";
  decision?: "allow" | "block" | "flag" | "pass" | "skipped";
  threshold: string;
  value?: string;
  actual?: string;
}

export interface Alternative {
  instrument: string;
  available: boolean;
  reason?: string;
  score?: number;
  estimated_cost?: number;
}

export interface TracePaymentEvent {
  agent_id: string;
  fleet_id: string;
  amount: number;
  domain: string;
  standard: string;
  outcome: string;
  token: string;
  chain: string;
}

export interface TraceWithEvent {
  _id: string;
  _creationTime: number;
  trace_id: string;
  agent_task_context: string;
  trigger_402_raw: string;
  alternatives_evaluated: Alternative[];
  policy_rules_fired: PolicyRule[];
  /** Seeded as `{ selected, reason }`; SDK emits a plain string. Render both. */
  instrument_selection_log: { selected: string; reason: string } | string;
  confidence: "high" | "medium" | "low";
  replay_snapshot: {
    policy_state: {
      daily_limit?: number;
      max_per_transaction?: number;
      domain_allowlist?: string[];
      allowed_standards?: string[];
      approval_threshold?: number;
    };
    vendor_registry_snapshot: Record<string, { is_blocked: boolean }>;
    agent_context: { spend_today?: number };
  };
  trace_hash: string;
  payment_tx_hash?: string | null;
  anchor_tx_hash?: string | null;
  payment_event: TracePaymentEvent | null;
}

export interface UseTracesOptions {
  limit?: number;
  agentId?: string;
  blockedOnly?: boolean;
}

export function useTraces(options: UseTracesOptions = {}) {
  // `traces:listAll` accepts optional filters; cast through `never` because
  // the generated Convex API names use snake_case args and the workspace's
  // strict tsconfig flags the spread otherwise. Same pattern used by the
  // CLI's `traces list` command (packages/cli/src/commands/traces/list.ts).
  const data = useQuery(api.traces.listAll, {
    limit: options.limit,
    agent_id: options.agentId,
    blocked_only: options.blockedOnly,
  } as never) as TraceListRow[] | undefined;
  return {
    data,
    isLoading: data === undefined,
  };
}

export function useTraceByTraceId(traceId: string | undefined) {
  // Convex returns `null` for unknown trace_id; `undefined` means still loading.
  const data = useQuery(
    api.traces.getByTraceId,
    traceId ? ({ trace_id: traceId } as never) : "skip",
  ) as TraceWithEvent | null | undefined;
  return {
    data,
    isLoading: data === undefined,
    notFound: data === null,
  };
}
