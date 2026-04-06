import type { DetectionResult } from "../types.js";

export interface ProtocolDetector {
  name: string;
  detect(
    status: number,
    headers: Record<string, string>,
    body: unknown,
  ): DetectionResult | null;
}
