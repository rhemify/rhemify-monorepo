import { createHash, randomUUID } from "node:crypto";
import type {
  DetectionResult,
  PolicyDecision,
  ScoredPath,
  TraceRecord,
} from "../types.js";
import type { TraceSnapshot } from "./types.js";

export type { TraceSnapshot } from "./types.js";

/**
 * Collects decision context as data flows through the 6-stage pipeline.
 * Each stage records its output on the trace. At finalization, the trace
 * produces a TraceRecord with a SHA-256 hash of canonical fields.
 */
export class Trace {
  readonly id: string;
  private url: string;
  private method: string;
  private agentId: string;
  private fleetId: string;
  private taskContext?: string;
  private taskStep?: number;
  private startedAt: string;

  private detection: DetectionResult | null = null;
  private policyDecision: PolicyDecision | null = null;
  private allPaths: ScoredPath[] = [];
  private chosenPath: ScoredPath | null = null;
  private executionSuccess = false;
  private executionTxHash?: string;
  private executionError?: string;
  private cachedRecord: TraceRecord | null = null;

  constructor(
    url: string,
    method: string,
    agentId: string,
    fleetId: string,
    taskContext?: string,
    taskStep?: number,
  ) {
    this.id = `trc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    this.url = url;
    this.method = method;
    this.agentId = agentId;
    this.fleetId = fleetId;
    this.taskContext = taskContext;
    this.taskStep = taskStep;
    this.startedAt = new Date().toISOString();
  }

  recordDetection(detection: DetectionResult): void {
    this.detection = detection;
  }

  recordPolicyDecision(decision: PolicyDecision): void {
    this.policyDecision = decision;
  }

  recordPathSelection(allPaths: ScoredPath[], chosen: ScoredPath | null): void {
    this.allPaths = allPaths;
    this.chosenPath = chosen;
  }

  recordExecution(success: boolean, txHash?: string, error?: string): void {
    this.executionSuccess = success;
    this.executionTxHash = txHash;
    this.executionError = error;
  }

  /**
   * Finalize the trace into a TraceRecord with a deterministic hash.
   * The hash covers: id, protocol, amount, network, agentId, fleetId, url, timestamp.
   */
  finalize(): TraceRecord {
    if (this.cachedRecord) return this.cachedRecord;

    if (!this.detection) {
      throw new Error("Cannot finalize trace without detection result");
    }
    if (!this.policyDecision) {
      throw new Error("Cannot finalize trace without policy decision");
    }

    const record: TraceRecord = {
      id: this.id,
      protocol: this.detection.protocol,
      amount: this.detection.price,
      network: this.detection.network,
      policyRulesFired: this.policyDecision.rulesFired,
      alternativesEvaluated: this.allPaths,
      chosenPath: this.chosenPath ?? {
        instrument: "ows",
        estimatedCost: 0,
        estimatedLatency: 0,
        risk: "high",
        score: Infinity,
        available: false,
        rejectedReason: "No path selected",
      },
      traceHash: "",
    };

    // Compute deterministic hash
    const canonical = JSON.stringify({
      id: record.id,
      protocol: record.protocol,
      amount: record.amount,
      network: record.network,
      agentId: this.agentId,
      fleetId: this.fleetId,
      url: this.url,
      timestamp: this.startedAt,
    });
    record.traceHash = createHash("sha256").update(canonical).digest("hex");

    this.cachedRecord = record;
    return record;
  }

  /** Build the full snapshot for ingestion to the Go server */
  toSnapshot(): TraceSnapshot {
    return {
      url: this.url,
      method: this.method,
      agentId: this.agentId,
      fleetId: this.fleetId,
      taskContext: this.taskContext,
      taskStep: this.taskStep,
      detection: this.detection!,
      policyDecision: this.policyDecision!,
      allPaths: this.allPaths,
      chosenPath: this.chosenPath,
      executionSuccess: this.executionSuccess,
      executionTxHash: this.executionTxHash,
      executionError: this.executionError,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}
