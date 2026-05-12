import { describe, it, expect, vi } from "vitest";
import { selectExecutor, executeWithCascade } from "../src/execute/index.js";
import { ExecutionError } from "../src/errors.js";
import type { DetectionResult, WalletConfig, ExecutionResult, PayOptions } from "../src/types.js";
import type { PaymentExecutor } from "../src/execute/types.js";

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

describe("selectExecutor", () => {
  it("selects x402 Solana executor for Solana x402 with Solana wallet", () => {
    const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
    const wallet: WalletConfig = { solanaPrivateKey: "fake" };

    const executor = selectExecutor(detection, wallet);
    expect(executor).not.toBeNull();
    expect(executor!.protocol).toBe("x402");
  });

  it("selects x402 EVM executor for Base x402 with EVM wallet", () => {
    const detection = makeDetection({ protocol: "x402", network: "base" });
    const wallet: WalletConfig = { evmPrivateKey: "0xfake" };

    const executor = selectExecutor(detection, wallet);
    expect(executor).not.toBeNull();
    expect(executor!.protocol).toBe("x402");
  });

  it("selects MPP charge executor for MPP with Solana wallet", () => {
    const detection = makeDetection({ protocol: "mpp", network: "solana-mainnet" });
    const wallet: WalletConfig = { solanaPrivateKey: "fake" };

    const executor = selectExecutor(detection, wallet);
    expect(executor).not.toBeNull();
    expect(executor!.protocol).toBe("mpp");
  });

  it("returns null when no executor matches", () => {
    // After Phase K, l402/ap2/acp resolve to ProtocolNotImplementedError
    // stubs (so callers get a typed error). "unknown" is the truly
    // unmatched case.
    const detection = makeDetection({ protocol: "unknown", network: "unknown" });
    const wallet: WalletConfig = { solanaPrivateKey: "fake" };

    const executor = selectExecutor(detection, wallet);
    expect(executor).toBeNull();
  });

  it("returns null when wallet is empty", () => {
    const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
    const wallet: WalletConfig = {};

    const executor = selectExecutor(detection, wallet);
    expect(executor).toBeNull();
  });

  it("returns null for x402 Solana with only EVM wallet", () => {
    const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
    const wallet: WalletConfig = { evmPrivateKey: "0xfake" };

    const executor = selectExecutor(detection, wallet);
    expect(executor).toBeNull();
  });
});

describe("executeWithCascade", () => {
  function mockExecutor(
    name: string,
    canExec: boolean,
    result?: Partial<ExecutionResult>,
    shouldThrow?: boolean,
  ): PaymentExecutor {
    return {
      protocol: "x402",
      networks: ["solana-mainnet"],
      canExecute: () => canExec,
      execute: vi.fn(async () => {
        if (shouldThrow) throw new Error(`${name} failed`);
        return {
          success: true,
          data: { from: name },
          txHash: `tx_${name}`,
          protocolReceipt: `receipt_${name}`,
          response: new Response(),
          ...result,
        };
      }),
    };
  }

  it("uses the first eligible executor", async () => {
    const exec1 = mockExecutor("first", true);
    const exec2 = mockExecutor("second", true);

    const result = await executeWithCascade(
      "https://example.com",
      makeDetection(),
      { solanaPrivateKey: "fake" },
      {},
      [exec1, exec2],
    );

    expect(result.data).toEqual({ from: "first" });
    expect(exec1.execute).toHaveBeenCalled();
    expect(exec2.execute).not.toHaveBeenCalled();
  });

  it("cascades to next executor on failure", async () => {
    const exec1 = mockExecutor("first", true, {}, true);
    const exec2 = mockExecutor("second", true);

    const result = await executeWithCascade(
      "https://example.com",
      makeDetection(),
      { solanaPrivateKey: "fake" },
      {},
      [exec1, exec2],
    );

    expect(result.data).toEqual({ from: "second" });
    expect(exec1.execute).toHaveBeenCalled();
    expect(exec2.execute).toHaveBeenCalled();
  });

  it("skips ineligible executors", async () => {
    const exec1 = mockExecutor("ineligible", false);
    const exec2 = mockExecutor("eligible", true);

    const result = await executeWithCascade(
      "https://example.com",
      makeDetection(),
      { solanaPrivateKey: "fake" },
      {},
      [exec1, exec2],
    );

    expect(result.data).toEqual({ from: "eligible" });
    expect(exec1.execute).not.toHaveBeenCalled();
  });

  it("throws ExecutionError when no executors are eligible", async () => {
    const exec1 = mockExecutor("none", false);

    await expect(
      executeWithCascade("https://example.com", makeDetection(), { solanaPrivateKey: "fake" }, {}, [
        exec1,
      ]),
    ).rejects.toThrow(ExecutionError);
  });

  it("throws ExecutionError when all eligible executors fail", async () => {
    const exec1 = mockExecutor("fail1", true, {}, true);
    const exec2 = mockExecutor("fail2", true, {}, true);

    await expect(
      executeWithCascade("https://example.com", makeDetection(), { solanaPrivateKey: "fake" }, {}, [
        exec1,
        exec2,
      ]),
    ).rejects.toThrow("All executors failed");
  });

  it("returns executor reference in result", async () => {
    const exec1 = mockExecutor("first", true);

    const result = await executeWithCascade(
      "https://example.com",
      makeDetection(),
      { solanaPrivateKey: "fake" },
      {},
      [exec1],
    );

    expect(result.executor).toBe(exec1);
  });
});
