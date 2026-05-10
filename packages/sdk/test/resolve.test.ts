import { describe, it, expect } from "vitest";
import { PathResolver } from "../src/resolve/index.js";
import type { DetectionResult, WalletConfig } from "../src/types.js";

function makeDetection(overrides?: Partial<DetectionResult>): DetectionResult {
  return {
    protocol: "x402",
    confidence: "high",
    network: "solana-mainnet",
    price: "$0.50",
    priceRaw: 500_000,
    currency: "USDC",
    payTo: "recipient",
    raw: { headers: {}, body: null },
    ...overrides,
  };
}

describe("PathResolver", () => {
  describe("Solana x402 payment", () => {
    it("ranks OWS Solana as best path for x402 on Solana", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const best = resolver.best(detection, wallet);
      expect(best).not.toBeNull();
      expect(best!.instrument).toBe("ows");
      expect(best!.available).toBe(true);
      expect(best!.risk).toBe("low");
    });

    it("returns all paths including unavailable ones", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      // Should have entries for all evaluators
      expect(paths.length).toBeGreaterThanOrEqual(5);

      // Available paths come first
      const firstUnavailable = paths.findIndex((p) => !p.available);
      const lastAvailable = paths.findLastIndex((p) => p.available);
      if (firstUnavailable !== -1 && lastAvailable !== -1) {
        expect(lastAvailable).toBeLessThan(firstUnavailable);
      }
    });

    it("unavailable paths have rejectedReason", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const unavailable = paths.filter((p) => !p.available);
      for (const p of unavailable) {
        expect(p.rejectedReason).toBeTruthy();
      }
    });
  });

  describe("EVM x402 payment", () => {
    it("ranks OWS EVM as best path for x402 on Base", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "base" });
      const wallet: WalletConfig = { evmPrivateKey: "0xfake" };

      const best = resolver.best(detection, wallet);
      expect(best).not.toBeNull();
      expect(best!.instrument).toBe("ows");
      expect(best!.available).toBe(true);
    });

    it("some OWS paths are unavailable for Base without Solana key", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "base" });
      const wallet: WalletConfig = { evmPrivateKey: "0xfake" };

      const paths = resolver.resolve(detection, wallet);
      const owsPaths = paths.filter((p) => p.instrument === "ows");
      // Should have both OWS evaluators — one available (EVM), one not (Solana)
      expect(owsPaths.length).toBe(2);
      expect(owsPaths.some((p) => p.available)).toBe(true);
      expect(owsPaths.some((p) => !p.available)).toBe(true);
    });
  });

  describe("MPP payment", () => {
    it("ranks AgentCard as unavailable without API key configured", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "mpp", network: "solana-mainnet" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const agentcard = paths.find((p) => p.instrument === "agentcard");
      expect(agentcard).toBeDefined();
      expect(agentcard!.available).toBe(false);
    });

    it("ranks AgentCard as available for MPP when API key configured", async () => {
      // Set the agentcard flag
      const { setAgentCardConfigured } = await import("../src/resolve/index.js");
      setAgentCardConfigured(true);

      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "mpp", network: "solana-mainnet" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const agentcard = paths.find((p) => p.instrument === "agentcard");
      expect(agentcard).toBeDefined();
      expect(agentcard!.available).toBe(true);

      // Reset
      setAgentCardConfigured(false);
    });

    it("AgentCard is not available for x402", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const agentcard = paths.find((p) => p.instrument === "agentcard");
      expect(agentcard!.available).toBe(false);
      expect(agentcard!.rejectedReason).toContain("MPP");
    });
  });

  describe("cross-chain (CCTP)", () => {
    it("CCTP path is intentionally disabled until executor lands (audit #10)", () => {
      // Pre-Phase-K: CCTP was available whenever wallet+vendor crossed chains.
      // Phase K disabled it because there is no cctpExecutor in execute/.
      // The path still appears in `resolve()` output for cost-panel rendering,
      // but `available` is false with a documented unavailableReason.
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "base" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const cctpPath = paths.find((p) => p.instrument === "cctp");
      expect(cctpPath).toBeDefined();
      expect(cctpPath!.available).toBe(false);
      expect(cctpPath!.rejectedReason).toContain("CCTP executor not implemented");
    });

    it("CCTP is unavailable when wallet matches vendor chain", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const cctpPath = paths.find((p) => p.instrument === "cctp");
      // Solana wallet + Solana vendor = no bridge needed, CCTP unavailable
      expect(cctpPath!.available).toBe(false);
    });
  });

  describe("no wallet", () => {
    it("returns null best path when no wallet configured", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
      const wallet: WalletConfig = {};

      const best = resolver.best(detection, wallet);
      expect(best).toBeNull();
    });

    it("all paths are unavailable with empty wallet", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
      const wallet: WalletConfig = {};

      const paths = resolver.resolve(detection, wallet);
      const available = paths.filter((p) => p.available);
      expect(available).toHaveLength(0);
    });
  });

  describe("scoring", () => {
    it("direct OWS is cheaper than Jupiter swap (when swap is needed)", () => {
      const resolver = new PathResolver();
      // Jupiter only available when currency is NOT USDC (token mismatch)
      const detection = makeDetection({ network: "solana-mainnet", currency: "SOL" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const ows = paths.find((p) => p.instrument === "ows" && p.available);
      const jup = paths.find((p) => p.instrument === "jupiter" && p.available);

      expect(ows).toBeDefined();
      expect(jup).toBeDefined();
      expect(ows!.score).toBeLessThan(jup!.score);
    });

    it("Jupiter is unavailable when vendor wants USDC (no swap needed)", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ network: "solana-mainnet", currency: "USDC" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const jup = paths.find((p) => p.instrument === "jupiter");
      expect(jup).toBeDefined();
      expect(jup!.available).toBe(false);
    });

    it("CCTP cost-estimate stays accurate even though path is disabled", () => {
      // Phase K disabled the cctp evaluator's availability, but its
      // estimateCost still reflects what a real CCTP bridge would charge,
      // so cost panels and forward-looking comparisons stay accurate. Once
      // a CCTP executor lands, flipping isAvailable back on requires no
      // change to score math.
      const resolver = new PathResolver();
      const detection = makeDetection({ network: "base" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key", evmPrivateKey: "0xfake" };

      const paths = resolver.resolve(detection, wallet);
      const owsEvm = paths.find((p) => p.instrument === "ows" && p.available);
      const cctpPath = paths.find((p) => p.instrument === "cctp");

      expect(owsEvm).toBeDefined();
      expect(cctpPath).toBeDefined();
      expect(cctpPath!.available).toBe(false);
      // Direct on-chain payment is cheaper than the (hypothetical) bridge.
      expect(owsEvm!.score).toBeLessThan(cctpPath!.score);
    });

    it("available paths are sorted by score ascending", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ network: "solana-mainnet" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const available = paths.filter((p) => p.available);
      for (let i = 1; i < available.length; i++) {
        expect(available[i]!.score).toBeGreaterThanOrEqual(available[i - 1]!.score);
      }
    });
  });
});
