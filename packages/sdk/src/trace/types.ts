import type { DetectionResult, PolicyContext, PolicyDecision, ScoredPath } from "../types.js";

export interface TraceSnapshot {
  url: string;
  method: string;
  agentId: string;
  fleetId: string;
  taskContext?: string;
  taskStep?: number;
  detection: DetectionResult;
  policyDecision: PolicyDecision;
  /**
   * The full policy + agent context evaluated against. Optional because
   * a trace can be finalized in an error path before context is captured
   * (e.g. detection failed). When present, drives replay_snapshot.policy_state
   * in the emitted trace — without it the counterfactual replay is empty.
   */
  policyContext?: PolicyContext;
  allPaths: ScoredPath[];
  chosenPath: ScoredPath | null;
  executionSuccess: boolean;
  executionTxHash?: string;
  executionError?: string;
  startedAt: string;
  completedAt: string;
}
