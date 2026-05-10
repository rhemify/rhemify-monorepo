import type { DetectionResult, InstrumentType, ScoredPath, WalletConfig } from "../types.js";
import type { InstrumentEvaluator } from "./types.js";

export type { InstrumentEvaluator } from "./types.js";

// Module-level flags — set by client factory when external services are configured
let agentcardConfigured = false;
export function setAgentCardConfigured(value: boolean) {
  agentcardConfigured = value;
}

let creditConfigured = false;
export function setCreditConfigured(value: boolean) {
  creditConfigured = value;
}

// --- Instrument evaluators ---

const credit: InstrumentEvaluator = {
  instrument: "credit" as InstrumentType,
  isAvailable(_wallet, _detection) {
    // Credit path available when a credit/prepaid balance service is configured
    return creditConfigured;
  },
  estimateCost(detection) {
    // Zero transaction fee — just the base price
    return basePrice(detection);
  },
  estimateLatency() {
    return 500; // API call only, no chain
  },
  risk() {
    return "low" as const;
  },
  unavailableReason() {
    return "No credit/prepaid balance service configured";
  },
};

const owsSolana: InstrumentEvaluator = {
  instrument: "ows",
  isAvailable(wallet, detection) {
    return !!wallet.solanaPrivateKey && isSolanaNetwork(detection.network);
  },
  estimateCost(detection) {
    // Direct on-chain: payment amount + ~0.000005 SOL tx fee (~$0.001)
    return basePrice(detection) + 0.001;
  },
  estimateLatency() {
    return 2000; // ~2s for Solana confirmation
  },
  risk() {
    return "low";
  },
  unavailableReason(wallet, detection) {
    if (!wallet.solanaPrivateKey) return "No Solana private key configured";
    return `Network ${detection.network} is not Solana`;
  },
};

const owsEvm: InstrumentEvaluator = {
  instrument: "ows",
  isAvailable(wallet, detection) {
    return !!wallet.evmPrivateKey && isEvmNetwork(detection.network);
  },
  estimateCost(detection) {
    // Direct on-chain: payment amount + ~$0.01-0.10 gas on Base
    return basePrice(detection) + 0.05;
  },
  estimateLatency() {
    return 3000; // ~3s for Base confirmation
  },
  risk() {
    return "low";
  },
  unavailableReason(wallet, detection) {
    if (!wallet.evmPrivateKey) return "No EVM private key configured";
    return `Network ${detection.network} is not EVM`;
  },
};

const privySolana: InstrumentEvaluator = {
  instrument: "privy",
  isAvailable(_wallet, detection) {
    // Privy is cloud-hosted — available if Solana network
    // In practice, requires privy session key (not yet implemented)
    return false && isSolanaNetwork(detection.network);
  },
  estimateCost(detection) {
    return basePrice(detection) + 0.002; // slightly more than OWS (API call overhead)
  },
  estimateLatency() {
    return 3000; // network round-trip to Privy TEE
  },
  risk() {
    return "low";
  },
  unavailableReason() {
    return "Privy signing not yet configured";
  },
};

const agentcard: InstrumentEvaluator = {
  instrument: "agentcard",
  isAvailable(_wallet, detection) {
    // AgentCard works with MPP (fiat path via Visa)
    // Only available if agentcard API key is configured (checked via executor)
    // and the detection is MPP protocol
    return detection.protocol === "mpp" && !!agentcardConfigured;
  },
  estimateCost(detection) {
    // AgentCard: payment amount + ~2.9% card processing
    return basePrice(detection) * 1.029;
  },
  estimateLatency() {
    return 5000; // card auth + settlement
  },
  risk() {
    return "low";
  },
  unavailableReason(_wallet, detection) {
    return `AgentCard requires MPP protocol, got ${detection.protocol}`;
  },
};

const squads: InstrumentEvaluator = {
  instrument: "squads",
  isAvailable(_wallet, detection) {
    // Squads sessions for recurring on-chain Solana vendors
    // Not yet implemented — requires Squads Smart Account setup
    return false && isSolanaNetwork(detection.network);
  },
  estimateCost(detection) {
    return basePrice(detection) + 0.0005; // near-zero per-call (session amortized)
  },
  estimateLatency() {
    return 1000; // voucher signing is fast
  },
  risk() {
    return "low";
  },
  unavailableReason() {
    return "Squads Smart Account session not configured";
  },
};

const jupiter: InstrumentEvaluator = {
  instrument: "jupiter",
  isAvailable(wallet, detection) {
    // Jupiter swap only needed when agent holds a different token than vendor wants.
    // Jupiter is mainnet only — no devnet support.
    const isMainnet = detection.network === "solana-mainnet" || detection.network === "mainnet-beta";
    return (
      !!wallet.solanaPrivateKey &&
      isMainnet &&
      detection.currency !== "USDC"
    );
  },
  estimateCost(detection) {
    // Swap: payment amount + ~0.3% slippage + tx fees
    return basePrice(detection) * 1.003 + 0.001;
  },
  estimateLatency() {
    return 4000; // quote + swap + confirm
  },
  risk() {
    return "medium"; // slippage risk
  },
  unavailableReason(wallet, detection) {
    if (!wallet.solanaPrivateKey) return "No Solana private key configured";
    return `Network ${detection.network} is not Solana`;
  },
};

const cctp: InstrumentEvaluator = {
  instrument: "cctp",
  isAvailable(_wallet, _detection) {
    // Audit #10: CCTP evaluator was speculative — there is no cctpExecutor
    // in execute/ to bridge USDC and pay. Until that executor lands,
    // PathResolver must NOT suggest CCTP as a winning path or the cascade
    // would fall through to the next available executor (or fail) and
    // confuse callers about which path was actually used.
    //
    // TODO(cctp): once a CrossChainBridge executor exists that:
    //   1. Quotes CCTP fast-transfer fees
    //   2. Burns USDC on source chain
    //   3. Mints USDC on destination chain
    //   4. Submits the original protocol payment from destination
    // re-enable this by restoring the legacy availability check:
    //   const hasSolana = !!wallet.solanaPrivateKey;
    //   const hasEvm = !!wallet.evmPrivateKey;
    //   const vendorOnEvm = isEvmNetwork(detection.network);
    //   const vendorOnSolana = isSolanaNetwork(detection.network);
    //   return (hasSolana && vendorOnEvm) || (hasEvm && vendorOnSolana);
    return false;
  },
  estimateCost(detection) {
    // Kept current so cost panels still render this option's hypothetical
    // price when isAvailable becomes true again.
    return basePrice(detection) + 0.1;
  },
  estimateLatency() {
    return 15000; // ~15s for CCTP fast transfer
  },
  risk() {
    return "medium";
  },
  unavailableReason(_wallet, _detection) {
    return "CCTP executor not implemented — see TODO(cctp) in src/resolve/index.ts";
  },
};

/**
 * Default instrument priority:
 * 0. Credit/prepaid balance — zero tx fee, fastest path
 * 1. AgentCard (fiat via MPP) — for fiat vendors
 * 2. Squads session — for recurring on-chain vendors
 * 3. Direct on-chain OWS (Solana or EVM) — one-off payments
 * 4. Jupiter swap — wrong token on same chain
 * 5. CCTP bridge — vendor on different chain
 */
const defaultEvaluators: InstrumentEvaluator[] = [
  credit,
  agentcard,
  squads,
  owsSolana,
  owsEvm,
  privySolana,
  jupiter,
  cctp,
];

export class PathResolver {
  private evaluators: InstrumentEvaluator[];

  constructor(evaluators?: InstrumentEvaluator[]) {
    this.evaluators = evaluators ?? defaultEvaluators;
  }

  /**
   * Score and rank all instruments for a given payment.
   * Returns all paths sorted by composite score (lower = better).
   * Unavailable paths are included with available=false for trace recording.
   */
  resolve(detection: DetectionResult, wallet: WalletConfig): ScoredPath[] {
    const paths: ScoredPath[] = this.evaluators.map((evaluator) => {
      const available = evaluator.isAvailable(wallet, detection);

      if (!available) {
        return {
          instrument: evaluator.instrument,
          estimatedCost: Infinity,
          estimatedLatency: Infinity,
          risk: "high" as const,
          score: Infinity,
          available: false,
          rejectedReason: evaluator.unavailableReason(wallet, detection),
        };
      }

      const cost = evaluator.estimateCost(detection);
      const latency = evaluator.estimateLatency(detection);
      const risk = evaluator.risk(detection);

      return {
        instrument: evaluator.instrument,
        estimatedCost: round(cost),
        estimatedLatency: latency,
        risk,
        score: round(computeScore(cost, latency, risk)),
        available: true,
      };
    });

    // Sort by score ascending (best first), unavailable last
    return paths.sort((a, b) => {
      if (a.available && !b.available) return -1;
      if (!a.available && b.available) return 1;
      return a.score - b.score;
    });
  }

  /** Get the best available path, or null if none available */
  best(detection: DetectionResult, wallet: WalletConfig): ScoredPath | null {
    const paths = this.resolve(detection, wallet);
    return paths.find((p) => p.available) ?? null;
  }
}

// --- Helpers ---

function isSolanaNetwork(network: string): boolean {
  return network.startsWith("solana") || network === "devnet" || network === "localnet";
}

function isEvmNetwork(network: string): boolean {
  const evmNetworks = ["base", "base-sepolia", "ethereum", "arbitrum", "optimism"];
  return evmNetworks.includes(network) || network.startsWith("eip155:");
}

/** Extract USD price from detection (base units → USD, assuming 6 decimal USDC) */
function basePrice(detection: DetectionResult): number {
  return Number(detection.priceRaw) / 1_000_000;
}

/**
 * Composite score: weighted combination of cost, latency, and risk.
 * Lower is better. Cost is dominant factor.
 */
function computeScore(cost: number, latencyMs: number, risk: "low" | "medium" | "high"): number {
  const riskMultiplier = risk === "low" ? 1.0 : risk === "medium" ? 1.2 : 1.5;
  const latencyPenalty = latencyMs / 10_000; // 10s = 1.0 penalty
  return (cost + latencyPenalty) * riskMultiplier;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
