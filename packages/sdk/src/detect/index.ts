import type { DetectionResult } from "../types.js";
import { DetectionError } from "../errors.js";
import type { ProtocolDetector } from "./types.js";
import { mppDetector } from "./mpp.js";
import { x402Detector } from "./x402.js";
import { l402Detector } from "./l402.js";
import { ap2Detector } from "./ap2.js";
import { acpDetector } from "./acp.js";

export type { ProtocolDetector } from "./types.js";

/**
 * Default detector chain, ordered by priority from CLAUDE.md:
 *   1. X-MPP-Payment-Intent → MPP
 *   2. x402 body (accepts / paymentRequirements)
 *   3. WWW-Authenticate: L402 → L402
 *   4. X-AP2-Payment → AP2
 *   5. X-ACP-Job → ACP
 *
 * MPP also matches on WWW-Authenticate: Payment header,
 * which takes priority since it's checked first.
 */
const defaultDetectors: ProtocolDetector[] = [
  mppDetector,
  x402Detector,
  l402Detector,
  ap2Detector,
  acpDetector,
];

export interface DetectOptions {
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  detectors?: ProtocolDetector[];
  cacheTtlMs?: number;
}

// Detection cache: domain → { result, expiresAt }
const detectionCache = new Map<string, { result: DetectionResult; expiresAt: number }>();
const DEFAULT_DETECTION_CACHE_TTL = 60_000; // 60s

/**
 * Makes an HTTP request to the URL and detects the payment protocol
 * from the 402 response. Runs detectors in priority order — first match wins.
 *
 * Results are cached per domain for cacheTtlMs (default 60s) to avoid
 * redundant requests when an agent hits the same vendor repeatedly.
 */
export async function detectProtocol(
  url: string,
  options?: DetectOptions,
): Promise<DetectionResult> {
  // Check cache by URL origin + pathname (not just domain — different
  // paths on the same host can return different payment protocols)
  const cacheTtl = options?.cacheTtlMs ?? DEFAULT_DETECTION_CACHE_TTL;
  let cacheKey: string | null = null;
  if (cacheTtl > 0) {
    try {
      const parsed = new URL(url);
      cacheKey = parsed.origin + parsed.pathname;
    } catch {
      // Invalid URL — skip cache
    }
    if (cacheKey) {
      const cached = detectionCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.result;
      }
    }
  }
  const {
    method = "GET",
    headers: extraHeaders,
    timeout = 10_000,
    detectors = defaultDetectors,
  } = options ?? {};

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: extraHeaders,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    throw new DetectionError(
      `Failed to reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
      url,
    );
  }

  if (response.status !== 402) {
    throw new DetectionError(
      `Expected 402, got ${response.status}`,
      url,
    );
  }

  // Collect headers into a plain object
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  // Parse body (JSON if possible, null otherwise)
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON — some protocols use headers only
  }

  // Run detector chain
  for (const detector of detectors) {
    const result = detector.detect(response.status, responseHeaders, body);
    if (result) {
      if (cacheKey && cacheTtl > 0) {
        detectionCache.set(cacheKey, { result, expiresAt: Date.now() + cacheTtl });
      }
      return result;
    }
  }

  // No detector matched
  return {
    protocol: "unknown",
    confidence: "low",
    network: "unknown",
    price: "unknown",
    priceRaw: 0,
    currency: "unknown",
    payTo: "",
    raw: { headers: responseHeaders, body },
  };
}

/**
 * Detect from pre-parsed response data (for testing and internal use).
 * Skips the HTTP request — runs detectors directly on provided data.
 */
export function detectFromResponse(
  status: number,
  headers: Record<string, string>,
  body: unknown,
  detectors: ProtocolDetector[] = defaultDetectors,
): DetectionResult {
  for (const detector of detectors) {
    const result = detector.detect(status, headers, body);
    if (result) return result;
  }

  return {
    protocol: "unknown",
    confidence: "low",
    network: "unknown",
    price: "unknown",
    priceRaw: 0,
    currency: "unknown",
    payTo: "",
    raw: { headers, body },
  };
}
