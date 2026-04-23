import type { DetectionResult } from "../types.js";
import type { ProtocolDetector } from "./types.js";

/**
 * Detects ACP (Agent Commerce Protocol / Virtuals) from 402 response.
 * Signal: X-ACP-Job header present
 *
 * Stub — detects the protocol but does not parse full challenge details.
 */
export const acpDetector: ProtocolDetector = {
  name: "acp",

  detect(status: number, headers: Record<string, string>, _body: unknown): DetectionResult | null {
    if (status !== 402) return null;

    const acpHeader = headers["x-acp-job"] ?? headers["X-ACP-Job"] ?? "";
    if (!acpHeader) return null;

    return {
      protocol: "acp",
      confidence: "medium",
      network: "base",
      price: "unknown",
      priceRaw: 0,
      currency: "unknown",
      payTo: "",
      raw: { headers, body: _body },
    };
  },
};
