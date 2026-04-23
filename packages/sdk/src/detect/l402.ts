import type { DetectionResult } from "../types.js";
import type { ProtocolDetector } from "./types.js";

/**
 * Detects L402 (Lightning) from 402 response.
 * Signal: WWW-Authenticate header starting with "L402" or "LSAT"
 *
 * Stub — detects the protocol but does not parse full challenge details.
 */
export const l402Detector: ProtocolDetector = {
  name: "l402",

  detect(status: number, headers: Record<string, string>, _body: unknown): DetectionResult | null {
    if (status !== 402) return null;

    const wwwAuth = headers["www-authenticate"] ?? headers["WWW-Authenticate"] ?? "";
    const lower = wwwAuth.toLowerCase();

    if (!lower.startsWith("l402") && !lower.startsWith("lsat")) return null;

    return {
      protocol: "l402",
      confidence: "medium",
      network: "lightning",
      price: "unknown",
      priceRaw: 0,
      currency: "sats",
      payTo: "",
      raw: { headers, body: _body },
    };
  },
};
