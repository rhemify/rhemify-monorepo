import type { DetectionResult } from "../types.js";
import type { ProtocolDetector } from "./types.js";

/**
 * Detects MPP (Micropayment Protocol) from 402 response.
 *
 * MPP uses the mppx framework (by wevm). Detection signals:
 * 1. WWW-Authenticate header starting with "Payment" — classic MPP challenge
 * 2. JSON body with `methods` array containing payment method descriptors
 * 3. JSON body with `challenge` object
 *
 * The @solana/mpp SDK builds on mppx with Solana-specific charge/session methods.
 */
export const mppDetector: ProtocolDetector = {
  name: "mpp",

  detect(status: number, headers: Record<string, string>, body: unknown): DetectionResult | null {
    if (status !== 402) return null;

    // Signal 1: WWW-Authenticate: Payment ...
    const wwwAuth = headers["www-authenticate"] ?? headers["WWW-Authenticate"] ?? "";
    if (wwwAuth.toLowerCase().startsWith("payment")) {
      return parseWwwAuthChallenge(wwwAuth, headers, body);
    }

    // Signal 2 & 3: JSON body with methods or challenge
    if (body && typeof body === "object") {
      const obj = body as Record<string, unknown>;

      // mppx body challenge with methods array
      if (Array.isArray(obj.methods) && obj.methods.length > 0) {
        return parseMppBodyChallenge(obj, headers);
      }

      // Direct challenge object
      if (obj.challenge && typeof obj.challenge === "object") {
        return parseMppBodyChallenge(obj.challenge as Record<string, unknown>, headers);
      }

      // mppx structured challenge: { amount, currency, recipient, methodDetails }
      if (obj.amount && obj.recipient) {
        return parseMppDirectChallenge(obj, headers, body);
      }
    }

    return null;
  },
};

function parseWwwAuthChallenge(
  wwwAuth: string,
  headers: Record<string, string>,
  body: unknown,
): DetectionResult {
  // Parse: Payment scheme="..." amount="..." recipient="..." session="..."
  const params = parseAuthParams(wwwAuth);

  const amount = params.amount ?? "0";
  const currency = params.currency ?? "USDC";
  const network = params.network ?? "solana-mainnet";

  return {
    protocol: "mpp",
    confidence: "high",
    network,
    price: formatMppPrice(amount, currency),
    priceRaw: Number(amount) || 0,
    currency,
    payTo: params.recipient ?? "",
    raw: { headers, body },
  };
}

function parseMppBodyChallenge(
  obj: Record<string, unknown>,
  headers: Record<string, string>,
): DetectionResult {
  // Look for a solana method in the methods array
  const methods = (obj.methods ?? []) as Record<string, unknown>[];
  const method = methods[0] ?? {};
  const details = (method.methodDetails ?? {}) as Record<string, unknown>;

  const amount = String(obj.amount ?? method.amount ?? "0");
  const currency = String(obj.currency ?? method.currency ?? "USDC");
  const network = String(details.network ?? "solana-mainnet");
  const recipient = String(obj.recipient ?? method.recipient ?? "");

  return {
    protocol: "mpp",
    confidence: "high",
    network,
    price: formatMppPrice(amount, currency),
    priceRaw: Number(amount) || 0,
    currency,
    payTo: recipient,
    raw: { headers, body: obj },
  };
}

function parseMppDirectChallenge(
  obj: Record<string, unknown>,
  headers: Record<string, string>,
  body: unknown,
): DetectionResult {
  const details = (obj.methodDetails ?? {}) as Record<string, unknown>;
  const amount = String(obj.amount ?? "0");
  const currency = String(obj.currency ?? "USDC");
  const network = String(details.network ?? "solana-mainnet");

  return {
    protocol: "mpp",
    confidence: "high",
    network,
    price: formatMppPrice(amount, currency),
    priceRaw: Number(amount) || 0,
    currency,
    payTo: String(obj.recipient ?? ""),
    raw: { headers, body },
  };
}

function parseAuthParams(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  // Match key="value" or key=value pairs after "Payment "
  const rest = header.replace(/^payment\s*/i, "");
  const regex = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  let match;
  while ((match = regex.exec(rest)) !== null) {
    params[match[1]!] = match[2] ?? match[3] ?? "";
  }
  return params;
}

function formatMppPrice(amount: string, currency: string): string {
  const num = Number(amount);
  if (isNaN(num)) return `${amount} ${currency}`;
  // MPP amounts from @solana/mpp are in base units (e.g. 10000 = 0.01 USDC with 6 decimals)
  const usd = num / 1_000_000;
  return `$${usd.toFixed(2)}`;
}
