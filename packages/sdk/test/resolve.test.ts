import { describe, it, expect } from "vitest";
import { PathResolver } from "../src/resolve/index.js";
import type { DetectionResult, WalletConfig } from "../src/types.js";

function makeDetection(
  overrides?: Partial<DetectionResult>,
): DetectionResult {
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
    it("ranks AgentCard as available for MPP protocol", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "mpp", network: "solana-mainnet" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const agentcard = paths.find((p) => p.instrument === "agentcard");
      expect(agentcard).toBeDefined();
      expect(agentcard!.available).toBe(true);
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
    it("CCTP is available when Solana wallet + EVM vendor", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ protocol: "x402", network: "base" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const cctpPath = paths.find((p) => p.instrument === "cctp");
      expect(cctpPath).toBeDefined();
      expect(cctpPath!.available).toBe(true);
      expect(cctpPath!.risk).toBe("medium");
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
    it("direct OWS is cheaper than Jupiter swap", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ network: "solana-mainnet" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key" };

      const paths = resolver.resolve(detection, wallet);
      const ows = paths.find((p) => p.instrument === "ows" && p.available);
      const jup = paths.find((p) => p.instrument === "jupiter" && p.available);

      expect(ows).toBeDefined();
      expect(jup).toBeDefined();
      expect(ows!.score).toBeLessThan(jup!.score);
    });

    it("CCTP bridge is more expensive than direct", () => {
      const resolver = new PathResolver();
      const detection = makeDetection({ network: "base" });
      const wallet: WalletConfig = { solanaPrivateKey: "fake-key", evmPrivateKey: "0xfake" };

      const paths = resolver.resolve(detection, wallet);
      const owsEvm = paths.find((p) => p.instrument === "ows" && p.available);
      const cctpPath = paths.find((p) => p.instrument === "cctp" && p.available);

      expect(owsEvm).toBeDefined();
      expect(cctpPath).toBeDefined();
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
