import type { DetectionResult, InstrumentType, WalletConfig } from "../types.js";

export interface InstrumentEvaluator {
  instrument: InstrumentType;
  /** Check if this instrument is available given wallet + detection */
  isAvailable(wallet: WalletConfig, detection: DetectionResult): boolean;
  /** Estimate cost in USD for this payment path */
  estimateCost(detection: DetectionResult): number;
  /** Estimate latency in ms */
  estimateLatency(detection: DetectionResult): number;
  /** Risk level of this path */
  risk(detection: DetectionResult): "low" | "medium" | "high";
  /** Why this instrument can't be used (when !isAvailable) */
  unavailableReason(wallet: WalletConfig, detection: DetectionResult): string;
}
