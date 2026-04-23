import type { DetectionResult } from "../types.js";
import type { ProtocolDetector } from "./types.js";

interface X402Requirement {
  scheme?: string;
  network?: string;
  maxAmountRequired?: string | number;
  amount?: string | number;
  price?: string | number;
  resource?: string;
  payTo?: string;
  extra?: { name?: string; currency?: string };
}

/**
 * Detects x402 (Coinbase) payment protocol from 402 response.
 *
 * x402 responses return JSON with payment requirements in one of these shapes:
 * - { accepts: [{ scheme, network, maxAmountRequired, payTo, ... }] }
 * - { paymentRequirements: [{ scheme, network, maxAmountRequired, payTo, ... }] }
 * - { scheme, network, maxAmountRequired, payTo, ... } (direct object)
 * - [{ scheme, network, ... }] (array at top level)
 */
export const x402Detector: ProtocolDetector = {
  name: "x402",

  detect(status: number, _headers: Record<string, string>, body: unknown): DetectionResult | null {
    if (status !== 402 || !body || typeof body !== "object") return null;

    const req = extractRequirement(body);
    if (!req) return null;

    const amount = String(req.maxAmountRequired ?? req.amount ?? req.price ?? "0");
    const network = req.network ?? "base";
    const currency = req.extra?.name ?? req.extra?.currency ?? guessCurrency(network);

    return {
      protocol: "x402",
      confidence: req.scheme ? "high" : "medium",
      network,
      price: formatPrice(amount, currency),
      priceRaw: parsePriceRaw(amount),
      currency,
      payTo: req.payTo ?? "",
      raw: { headers: _headers, body },
    };
  },
};

function extractRequirement(body: unknown): X402Requirement | null {
  const obj = body as Record<string, unknown>;

  // { accepts: [...] }
  if (Array.isArray(obj.accepts) && obj.accepts.length > 0) {
    return obj.accepts[0] as X402Requirement;
  }

  // { paymentRequirements: [...] }
  if (Array.isArray(obj.paymentRequirements) && obj.paymentRequirements.length > 0) {
    return obj.paymentRequirements[0] as X402Requirement;
  }

  // Direct object with scheme field
  if (obj.scheme) {
    return obj as unknown as X402Requirement;
  }

  // Top-level array
  if (Array.isArray(body) && body.length > 0 && body[0]?.scheme) {
    return body[0] as X402Requirement;
  }

  return null;
}

function guessCurrency(network: string): string {
  if (network.startsWith("solana")) return "USDC";
  return "USDC"; // x402 is primarily USDC
}

function formatPrice(amount: string, currency: string): string {
  const num = Number(amount);
  if (isNaN(num)) return `${amount} ${currency}`;
  // x402 amounts are typically in base units (e.g. 500000 = $0.50 USDC with 6 decimals)
  const usd = num / 1_000_000;
  return `$${usd.toFixed(2)}`;
}

function parsePriceRaw(amount: string): number | bigint {
  const num = Number(amount);
  if (Number.isInteger(num)) return num;
  return num;
}
