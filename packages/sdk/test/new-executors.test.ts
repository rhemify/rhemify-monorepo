import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditPayExecutor, setCreditConfig } from "../src/execute/credit-pay.js";
import { jupiterSwapExecutor, setJupiterApiKey } from "../src/execute/jupiter-swap.js";
import { agentcardMppExecutor, setAgentCardApiKey } from "../src/execute/agentcard-mpp.js";
import { ExecutionError } from "../src/errors.js";
import type { DetectionResult, PayOptions, WalletConfig } from "../src/types.js";

function makeDetection(overrides?: Partial<DetectionResult>): DetectionResult {
  return {
    protocol: "x402",
    confidence: "high",
    network: "solana-mainnet",
    price: "$0.50",
    priceRaw: 500_000,
    currency: "USDC",
    payTo: "recipient",
    raw: {
      headers: { "x-resource-url": "https://perplexity.ai/search" },
      body: null,
    },
    ...overrides,
  };
}

const payOptions: PayOptions = { method: "GET" };
const wallet: WalletConfig = { solanaPrivateKey: "fake" };

// ─── credit-pay ─────────────────────────────────────────────────────────────

describe("creditPayExecutor", () => {
  beforeEach(() => {
    setCreditConfig({ apiKey: "test-key", balance: 10, domains: ["perplexity.ai"] });
  });

  afterEach(() => {
    setCreditConfig({ apiKey: undefined, balance: 0, domains: [] });
    vi.restoreAllMocks();
  });

  it("canExecute returns true when configured and vendor is in registry", () => {
    const detection = makeDetection();
    expect(creditPayExecutor.canExecute(detection, wallet)).toBe(true);
  });

  it("canExecute returns false without an API key", () => {
    setCreditConfig({ apiKey: undefined, balance: 10, domains: ["perplexity.ai"] });
    expect(creditPayExecutor.canExecute(makeDetection(), wallet)).toBe(false);
  });

  it("canExecute returns false with zero balance", () => {
    setCreditConfig({ apiKey: "test-key", balance: 0, domains: ["perplexity.ai"] });
    expect(creditPayExecutor.canExecute(makeDetection(), wallet)).toBe(false);
  });

  it("canExecute returns false when vendor not in registry", () => {
    const detection = makeDetection({
      raw: { headers: { "x-resource-url": "https://unknown-vendor.com/" }, body: null },
    });
    expect(creditPayExecutor.canExecute(detection, wallet)).toBe(false);
  });

  it("throws ExecutionError on insufficient balance", async () => {
    setCreditConfig({ apiKey: "test-key", balance: 0.1, domains: ["perplexity.ai"] });
    const detection = makeDetection({ priceRaw: 500_000 }); // $0.50 > $0.10 balance
    await expect(
      creditPayExecutor.execute("https://perplexity.ai/search", detection, wallet, payOptions),
    ).rejects.toThrow(ExecutionError);
  });

  it("throws ExecutionError when API key was never configured", async () => {
    setCreditConfig({ apiKey: undefined, balance: 10, domains: ["perplexity.ai"] });
    await expect(
      creditPayExecutor.execute("https://perplexity.ai/search", makeDetection(), wallet, payOptions),
    ).rejects.toThrow(/Credit API key not configured/);
  });
});

// ─── jupiter-swap ───────────────────────────────────────────────────────────

describe("jupiterSwapExecutor", () => {
  beforeEach(() => {
    setJupiterApiKey("test-jupiter-key");
  });

  afterEach(() => {
    setJupiterApiKey(undefined);
  });

  it("canExecute returns true for mainnet x402 with non-USDC currency", () => {
    const detection = makeDetection({
      network: "solana-mainnet",
      currency: "SOL",
      protocol: "x402",
    });
    expect(jupiterSwapExecutor.canExecute(detection, wallet)).toBe(true);
  });

  it("canExecute returns false without Jupiter API key", () => {
    setJupiterApiKey(undefined);
    const detection = makeDetection({ currency: "SOL" });
    expect(jupiterSwapExecutor.canExecute(detection, wallet)).toBe(false);
  });

  it("canExecute returns false for devnet", () => {
    const detection = makeDetection({ network: "solana-devnet", currency: "SOL" });
    expect(jupiterSwapExecutor.canExecute(detection, wallet)).toBe(false);
  });

  it("canExecute returns false for USDC (no swap needed)", () => {
    const detection = makeDetection({ currency: "USDC" });
    expect(jupiterSwapExecutor.canExecute(detection, wallet)).toBe(false);
  });

  it("canExecute returns false without a Solana wallet", () => {
    const detection = makeDetection({ currency: "SOL" });
    expect(jupiterSwapExecutor.canExecute(detection, { evmPrivateKey: "0x1" })).toBe(false);
  });

  it("throws NoWalletError when wallet missing at execute time", async () => {
    const detection = makeDetection({ currency: "SOL" });
    await expect(
      jupiterSwapExecutor.execute("https://x.com/pay", detection, {}, payOptions),
    ).rejects.toThrow();
  });

  it("throws ExecutionError when API key not configured at execute time", async () => {
    setJupiterApiKey(undefined);
    const detection = makeDetection({ currency: "SOL" });
    await expect(
      jupiterSwapExecutor.execute("https://x.com/pay", detection, wallet, payOptions),
    ).rejects.toThrow(/Jupiter API key not configured/);
  });
});

// ─── agentcard-mpp ──────────────────────────────────────────────────────────

describe("agentcardMppExecutor", () => {
  afterEach(() => {
    setAgentCardApiKey(undefined);
  });

  it("canExecute always returns false while integration is stubbed", () => {
    setAgentCardApiKey("test-key");
    const detection = makeDetection({ protocol: "mpp" });
    expect(agentcardMppExecutor.canExecute(detection, wallet)).toBe(false);
  });

  it("canExecute returns false without API key for any protocol", () => {
    setAgentCardApiKey(undefined);
    expect(agentcardMppExecutor.canExecute(makeDetection({ protocol: "mpp" }), wallet)).toBe(false);
  });

  it("throws ExecutionError when API key not configured at execute time", async () => {
    setAgentCardApiKey(undefined);
    const detection = makeDetection({ protocol: "mpp" });
    await expect(
      agentcardMppExecutor.execute("https://merchant.com/pay", detection, wallet, payOptions),
    ).rejects.toThrow(/AgentCard API key not configured/);
  });
});
