import type { PaymentProtocol } from "../types.js";

export interface ServiceCandidate {
  name: string;
  url: string;
  protocol: PaymentProtocol;
  /** Normalized to per-request USDC cost */
  costPerRequest: number;
  estimatedLatencyMs: number;
  reliabilityScore: number;
  source: "agentic-market" | "tempo";
  category?: string;
}

interface AgenticMarketService {
  id: string;
  name: string;
  url: string;
  price_per_request?: number;
  price?: number;
  latency_ms?: number;
  category?: string;
}

interface TempoService {
  id: string;
  name: string;
  endpoint: string;
  price_per_voucher?: number;
  price?: number;
  session_fee?: number;
  latency_ms?: number;
  category?: string;
}

const AGENTIC_MARKET_BASE = "https://agentic.market/v1";
const TEMPO_BASE = "https://tempo.xyz/v1";
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  services: ServiceCandidate[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Discover services matching an intent from Agentic Market (x402)
 * and Tempo (MPP) in parallel, normalized to a common interface.
 *
 * Results are cached per intent for 60 seconds to avoid hammering
 * the directory APIs on every payment.
 */
export async function discover(
  intent: string,
  opts: {
    /** Max candidates to return after scoring. Default 5. */
    limit?: number;
    /** If set, only return services from this protocol. */
    protocol?: "x402" | "mpp";
    /** Estimated number of requests per session — used for MPP cost normalization. */
    estimatedRequests?: number;
    timeoutMs?: number;
  } = {},
): Promise<ServiceCandidate[]> {
  const cacheKey = `${intent}:${opts.protocol ?? "all"}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.services.slice(0, opts.limit ?? 5);
  }

  const estimatedRequests = opts.estimatedRequests ?? 10;
  const timeout = opts.timeoutMs ?? 5000;

  const fetchers: Promise<ServiceCandidate[]>[] = [];

  if (!opts.protocol || opts.protocol === "x402") {
    fetchers.push(fetchAgenticMarket(intent, timeout));
  }
  if (!opts.protocol || opts.protocol === "mpp") {
    fetchers.push(fetchTempo(intent, estimatedRequests, timeout));
  }

  const results = await Promise.allSettled(fetchers);
  const candidates: ServiceCandidate[] = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );

  const scored = candidates
    .sort((a, b) => score(b) - score(a))
    .slice(0, opts.limit ?? 5);

  cache.set(cacheKey, { services: scored, fetchedAt: Date.now() });
  return scored;
}

async function fetchAgenticMarket(
  intent: string,
  timeoutMs: number,
): Promise<ServiceCandidate[]> {
  const url = `${AGENTIC_MARKET_BASE}/services/search?q=${encodeURIComponent(intent)}`;
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) return [];

  const data = await res.json();
  const services: AgenticMarketService[] = Array.isArray(data)
    ? data
    : data.services ?? data.results ?? [];

  return services.map((s) => ({
    name: s.name,
    url: s.url,
    protocol: "x402",
    costPerRequest: normalizePrice(s.price_per_request ?? s.price ?? 0),
    estimatedLatencyMs: s.latency_ms ?? 400,
    reliabilityScore: 0.95,
    source: "agentic-market",
    category: s.category,
  }));
}

async function fetchTempo(
  intent: string,
  estimatedRequests: number,
  timeoutMs: number,
): Promise<ServiceCandidate[]> {
  const url = `${TEMPO_BASE}/services/search?q=${encodeURIComponent(intent)}`;
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) return [];

  const data = await res.json();
  const services: TempoService[] = Array.isArray(data)
    ? data
    : data.services ?? data.results ?? [];

  return services.map((s) => ({
    name: s.name,
    url: s.endpoint,
    protocol: "mpp",
    costPerRequest: normalizeMppCost(
      s.price_per_voucher ?? s.price ?? 0,
      s.session_fee ?? 0,
      estimatedRequests,
    ),
    estimatedLatencyMs: s.latency_ms ?? 200,
    reliabilityScore: 0.97,
    source: "tempo",
    category: s.category,
  }));
}

/**
 * Score a candidate for ranking.
 * Higher is better.
 * Weights: cost 60%, latency 20%, reliability 20%.
 */
function score(s: ServiceCandidate): number {
  const costScore = Math.max(0, 1 - s.costPerRequest * 10);
  const latencyScore = Math.max(0, 1 - s.estimatedLatencyMs / 5000);
  const reliabilityScore = s.reliabilityScore;
  return 0.6 * costScore + 0.2 * latencyScore + 0.2 * reliabilityScore;
}

/** Normalize raw price to USDC float (handles both micro-units and float inputs). */
function normalizePrice(raw: number): number {
  // x402 prices >1000 are assumed to be micro-units (e.g. 500000 = $0.50)
  if (raw > 1000) return raw / 1_000_000;
  return raw;
}

/**
 * MPP cost normalization: spread session overhead across estimated requests
 * so x402 and MPP candidates are comparable on a per-request basis.
 */
function normalizeMppCost(
  pricePerVoucher: number,
  sessionFee: number,
  estimatedRequests: number,
): number {
  const voucherCost = normalizePrice(pricePerVoucher);
  const sessionOverhead = normalizePrice(sessionFee) / Math.max(1, estimatedRequests);
  return voucherCost + sessionOverhead;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Invalidate a specific intent from cache (call after a service fails). */
export function invalidateDiscoveryCache(intent: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(intent)) cache.delete(key);
  }
}
