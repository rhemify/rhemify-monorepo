import type { DetectionResult } from "../types.js";
import type { ProtocolDetector } from "./types.js";

/**
 * Detects AP2 (Autonomous Payments v2) from 402 response.
 * Signal: X-AP2-Payment header present
 *
 * Stub — detects the protocol but does not parse full challenge details.
 */
export const ap2Detector: ProtocolDetector = {
  name: "ap2",

  detect(status: number, headers: Record<string, string>, _body: unknown): DetectionResult | null {
    if (status !== 402) return null;

    const ap2Header = headers["x-ap2-payment"] ?? headers["X-AP2-Payment"] ?? "";
    if (!ap2Header) return null;

    return {
      protocol: "ap2",
      confidence: "medium",
      network: "unknown",
      price: "unknown",
      priceRaw: 0,
      currency: "unknown",
      payTo: "",
      raw: { headers, body: _body },
    };
  },
};
