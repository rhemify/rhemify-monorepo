import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../src/policy/index.js";
import type {
  DetectionResult,
  PolicyContext,
} from "../src/types.js";

// Helper: create a detection result with a given price in base units (USDC 6 decimals)
function makeDetection(priceRaw: number, protocol = "x402" as const, network = "solana-mainnet"): DetectionResult {
  return {
    protocol,
    confidence: "high",
    network,
    price: `$${(priceRaw / 1_000_000).toFixed(2)}`,
    priceRaw,
    currency: "USDC",
    payTo: "recipient",
    raw: { headers: {}, body: null },
  };
}

// Helper: create a policy context
function makeContext(overrides?: Partial<PolicyContext>): PolicyContext {
  return {
    policy: {
      dailyLimit: 100,
      maxPerTransaction: 50,
      approvalThreshold: 0,
      allowedStandards: [],
      domainAllowlist: [],
      ...overrides?.policy,
    },
    spentToday: 0,
    blockedDomains: [],
    ...overrides,
  };
}

// Create engine that doesn't need a real transport (we use evaluateWithContext)
function makeEngine() {
  return new PolicyEngine(null as never, "agent-1", 30_000);
}

describe("PolicyEngine", () => {
  describe("daily_limit rule", () => {
    it("allows payment within daily limit", () => {
      const engine = makeEngine();
      const detection = makeDetection(10_000_000); // $10
      const context = makeContext({ spentToday: 50 }); // $50 spent, $100 limit

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("allow");
    });

    it("blocks payment that would exceed daily limit", () => {
      const engine = makeEngine();
      const detection = makeDetection(60_000_000); // $60
      const context = makeContext({ spentToday: 50 }); // $50 + $60 = $110 > $100

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("block");
      expect(result.reason).toContain("daily_limit");
    });

    it("blocks payment at exact limit boundary", () => {
      const engine = makeEngine();
      const detection = makeDetection(1_000_000); // $1
      const context = makeContext({ spentToday: 100 }); // $100 + $1 = $101 > $100

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("block");
    });
  });

  describe("max_per_tx rule", () => {
    it("allows payment under max per transaction", () => {
      const engine = makeEngine();
      const detection = makeDetection(10_000_000); // $10, limit $50
      const context = makeContext();

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("allow");
    });

    it("blocks payment over max per transaction", () => {
      const engine = makeEngine();
      const detection = makeDetection(60_000_000); // $60 > $50 limit
      const context = makeContext();

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("block");
      expect(result.reason).toContain("max_per_tx");
    });
  });

  describe("domain_allowlist rule", () => {
    it("allows any domain when allowlist is empty", () => {
      const engine = makeEngine();
      const detection = makeDetection(1_000_000);
      const context = makeContext();

      const result = engine.evaluateWithContext(detection, "random-api.com", context);
      expect(result.action).toBe("allow");
    });

    it("allows domain in allowlist", () => {
      const engine = makeEngine();
      const detection = makeDetection(1_000_000);
      const context = makeContext({
        policy: {
          dailyLimit: 100,
          maxPerTransaction: 50,
          approvalThreshold: 0,
          allowedStandards: [],
          domainAllowlist: ["api.example.com", "api.bloomberg.com"],
        },
      });

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("allow");
    });

    it("blocks domain not in allowlist", () => {
      const engine = makeEngine();
      const detection = makeDetection(1_000_000);
      const context = makeContext({
        policy: {
          dailyLimit: 100,
          maxPerTransaction: 50,
          approvalThreshold: 0,
          allowedStandards: [],
          domainAllowlist: ["api.example.com"],
        },
      });

      const result = engine.evaluateWithContext(detection, "api.evil.com", context);
      expect(result.action).toBe("block");
      expect(result.reason).toContain("domain_allowlist");
    });
  });

  describe("allowed_standards rule", () => {
    it("allows any standard when list is empty", () => {
      const engine = makeEngine();
      const detection = makeDetection(1_000_000, "l402");
      const context = makeContext();

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("allow");
    });

    it("allows standard in allowed list", () => {
      const engine = makeEngine();
      const detection = makeDetection(1_000_000, "x402");
      const context = makeContext({
        policy: {
          dailyLimit: 100,
          maxPerTransaction: 50,
          approvalThreshold: 0,
          allowedStandards: ["x402", "mpp"],
          domainAllowlist: [],
        },
      });

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("allow");
    });

    it("blocks disallowed standard", () => {
      const engine = makeEngine();
      const detection = makeDetection(1_000_000, "l402");
      const context = makeContext({
        policy: {
          dailyLimit: 100,
          maxPerTransaction: 50,
          approvalThreshold: 0,
          allowedStandards: ["x402", "mpp"],
          domainAllowlist: [],
        },
      });

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("block");
      expect(result.reason).toContain("allowed_standards");
    });
  });

  describe("domain_blocked rule (intelligence)", () => {
    it("allows domain not in blocked list", () => {
      const engine = makeEngine();
      const detection = makeDetection(1_000_000);
      const context = makeContext();

      const result = engine.evaluateWithContext(detection, "api.good.com", context);
      expect(result.action).toBe("allow");
    });

    it("blocks domain auto-blocked by intelligence", () => {
      const engine = makeEngine();
      const detection = makeDetection(1_000_000);
      const context = makeContext({
        blockedDomains: ["api.flaky.com"],
      });

      const result = engine.evaluateWithContext(detection, "api.flaky.com", context);
      expect(result.action).toBe("block");
      expect(result.reason).toContain("domain_blocked");
      expect(result.suggestion).toContain("auto-blocked");
    });
  });

  describe("approval_threshold rule", () => {
    it("allows when threshold is 0 (disabled)", () => {
      const engine = makeEngine();
      const detection = makeDetection(100_000_000); // $100
      const context = makeContext();

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      // max_per_tx will block this ($100 > $50), but approval_threshold won't
      const approvalRule = result.rulesFired.find(r => r.rule === "approval_threshold");
      expect(approvalRule?.decision).toBe("allow");
    });

    it("flags payment at or above threshold", () => {
      const engine = makeEngine();
      const detection = makeDetection(5_000_000); // $5
      const context = makeContext({
        policy: {
          dailyLimit: 100,
          maxPerTransaction: 50,
          approvalThreshold: 5,
          allowedStandards: [],
          domainAllowlist: [],
        },
      });

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("flag");
      expect(result.reason).toContain("approval_threshold");
    });

    it("allows payment below threshold", () => {
      const engine = makeEngine();
      const detection = makeDetection(4_000_000); // $4
      const context = makeContext({
        policy: {
          dailyLimit: 100,
          maxPerTransaction: 50,
          approvalThreshold: 5,
          allowedStandards: [],
          domainAllowlist: [],
        },
      });

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("allow");
    });
  });

  describe("rule precedence", () => {
    it("block takes precedence over flag", () => {
      const engine = makeEngine();
      const detection = makeDetection(60_000_000); // $60 > $50 max_per_tx
      const context = makeContext({
        policy: {
          dailyLimit: 100,
          maxPerTransaction: 50,
          approvalThreshold: 5, // would flag at $5
          allowedStandards: [],
          domainAllowlist: [],
        },
      });

      const result = engine.evaluateWithContext(detection, "api.example.com", context);
      expect(result.action).toBe("block");
    });

    it("all rules fire regardless of earlier blocks", () => {
      const engine = makeEngine();
      const detection = makeDetection(1_000_000);
      const context = makeContext({
        blockedDomains: ["api.evil.com"],
      });

      const result = engine.evaluateWithContext(detection, "api.evil.com", context);
      // All 6 rules should have fired
      expect(result.rulesFired).toHaveLength(6);
    });
  });

  describe("cache invalidation", () => {
    it("invalidateCache clears cached policy", () => {
      const engine = makeEngine();
      // Internal test — just verify no error
      engine.invalidateCache();
      engine.invalidateCache(); // double invalidate is safe
    });
  });
});
