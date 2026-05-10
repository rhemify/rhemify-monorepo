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
 * x402 v2 puts payment requirements in a base64-encoded `payment-required` header.
 * v1 and some implementations put them in the JSON body in one of these shapes:
 * - { accepts: [{ scheme, network, maxAmountRequired, payTo, ... }] }
 * - { paymentRequirements: [{ scheme, network, maxAmountRequired, payTo, ... }] }
 * - { scheme, network, maxAmountRequired, payTo, ... } (direct object)
 * - [{ scheme, network, ... }] (array at top level)
 */
export const x402Detector: ProtocolDetector = {
  name: "x402",

  detect(
    status: number,
    _headers: Record<string, string>,
    body: unknown,
  ): DetectionResult | null {
    if (status !== 402) return null;

    // x402 v2: base64-encoded JSON in `payment-required` header
    const paymentRequiredHeader = _headers["payment-required"];
    let headerBody: unknown = null;
    if (paymentRequiredHeader) {
      try {
        const decoded = atob(paymentRequiredHeader);
        headerBody = JSON.parse(decoded);
      } catch {
        // Not valid base64 JSON — fall through to body parsing
      }
    }

    // Try header-decoded data first, then body
    const source = headerBody ?? body;
    if (!source || typeof source !== "object") return null;

    const req = extractRequirement(source);
    if (!req) return null;

    const amount = String(
      req.maxAmountRequired ?? req.amount ?? req.price ?? "0",
    );
    const network = normalizeNetwork(req.network ?? "base");
    const currency =
      req.extra?.name ?? req.extra?.currency ?? guessCurrency(network);

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

  // { accepts: [...] } — prefer Solana networks (Rhemify is Solana-first)
  if (Array.isArray(obj.accepts) && obj.accepts.length > 0) {
    return pickPreferred(obj.accepts as X402Requirement[]);
  }

  // { paymentRequirements: [...] } — same preference
  if (
    Array.isArray(obj.paymentRequirements) &&
    obj.paymentRequirements.length > 0
  ) {
    return pickPreferred(obj.paymentRequirements as X402Requirement[]);
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

/** When multiple accepts exist, prefer Solana networks (Rhemify is Solana-first) */
function pickPreferred(reqs: X402Requirement[]): X402Requirement {
  const solana = reqs.find(
    (r) => r.network?.startsWith("solana") || normalizeNetwork(r.network ?? "").startsWith("solana"),
  );
  if (solana) return solana;
  const fallback = reqs[0];
  if (!fallback) {
    throw new Error("x402.pickPreferred: callers must pass a non-empty array");
  }
  return fallback;
}

/** Map CAIP-2 network identifiers to our short names */
function normalizeNetwork(network: string): string {
  const caip2Map: Record<string, string> = {
    "eip155:8453": "base",
    "eip155:84532": "base-sepolia",
    "eip155:1": "ethereum",
    "eip155:42161": "arbitrum",
    "eip155:10": "optimism",
    "eip155:137": "polygon",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "solana-mainnet",
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": "solana-devnet",
  };
  return caip2Map[network] ?? network;
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
