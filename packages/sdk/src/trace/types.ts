import type {
  DetectionResult,
  PolicyDecision,
  ScoredPath,
} from "../types.js";

export interface TraceSnapshot {
  url: string;
  method: string;
  agentId: string;
  fleetId: string;
  taskContext?: string;
  taskStep?: number;
  detection: DetectionResult;
  policyDecision: PolicyDecision;
  allPaths: ScoredPath[];
  chosenPath: ScoredPath | null;
  executionSuccess: boolean;
  executionTxHash?: string;
  executionError?: string;
  startedAt: string;
  completedAt: string;
}
