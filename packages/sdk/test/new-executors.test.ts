import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditPayExecutor, setCreditConfig } from "../src/execute/credit-pay.js";
import { jupiterSwapExecutor, setJupiterApiKey } from "../src/execute/jupiter-swap.js";
import { agentcardMppExecutor, setAgentCardApiKey } from "../src/execute/agentcard-mpp.js";
import { x402SolanaExecutor } from "../src/execute/x402-solana.js";
import { x402SolanaTransferExecutor } from "../src/execute/x402-solana-transfer.js";
import { x402EvmTransferExecutor } from "../src/execute/x402-evm-transfer.js";
import { mppChargeExecutor } from "../src/execute/mpp-charge.js";
import { mppChargeTransferExecutor } from "../src/execute/mpp-charge-transfer.js";
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

// ─── x402-solana (real on-chain memo executor, phase O.2) ────────────────────
//
// Execute path requires Solana RPC + funded keypair, so it's exercised by
// the live e2e flow (rhemify pay against tools/test-402/server.ts) rather
// than these unit tests. What we CAN test cheaply: the canExecute predicate
// that gates which executor the cascade picks. Bugs there silently re-route
// payments to the wrong executor (or skip everything and fall to the
// unsupported-protocol stubs).

describe("x402SolanaExecutor", () => {
  it("canExecute returns true for x402 on solana-devnet with a Solana wallet", () => {
    const detection = makeDetection({ protocol: "x402", network: "solana-devnet" });
    expect(x402SolanaExecutor.canExecute(detection, wallet)).toBe(true);
  });

  it("canExecute returns true for x402 on solana-mainnet", () => {
    const detection = makeDetection({ protocol: "x402", network: "solana-mainnet" });
    expect(x402SolanaExecutor.canExecute(detection, wallet)).toBe(true);
  });

  it("canExecute returns false for EVM networks (executor cascade should fall through to x402-evm)", () => {
    expect(
      x402SolanaExecutor.canExecute(makeDetection({ protocol: "x402", network: "base" }), wallet),
    ).toBe(false);
    expect(
      x402SolanaExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "base-sepolia" }),
        wallet,
      ),
    ).toBe(false);
  });

  it("canExecute returns false without a Solana wallet", () => {
    const detection = makeDetection({ protocol: "x402", network: "solana-devnet" });
    expect(x402SolanaExecutor.canExecute(detection, {})).toBe(false);
    expect(x402SolanaExecutor.canExecute(detection, { evmPrivateKey: "0x1" })).toBe(false);
  });

  it("canExecute returns false for non-x402 protocols", () => {
    expect(
      x402SolanaExecutor.canExecute(
        makeDetection({ protocol: "mpp", network: "solana-devnet" }),
        wallet,
      ),
    ).toBe(false);
    expect(
      x402SolanaExecutor.canExecute(
        makeDetection({ protocol: "l402", network: "solana-devnet" }),
        wallet,
      ),
    ).toBe(false);
  });
});

// ─── mpp-charge (real on-chain memo executor, phase O.3) ─────────────────────

describe("mppChargeExecutor", () => {
  it("canExecute returns true for mpp on solana-devnet with a Solana wallet", () => {
    const detection = makeDetection({ protocol: "mpp", network: "solana-devnet" });
    expect(mppChargeExecutor.canExecute(detection, wallet)).toBe(true);
  });

  it("canExecute returns true for mpp on solana-mainnet", () => {
    const detection = makeDetection({ protocol: "mpp", network: "solana-mainnet" });
    expect(mppChargeExecutor.canExecute(detection, wallet)).toBe(true);
  });

  it("canExecute returns true on the legacy 'devnet' / 'mainnet-beta' network aliases", () => {
    // Detector for MPP via WWW-Authenticate header sometimes yields these
    // shorter strings. The executor's isSolanaNetwork accepts them so the
    // cascade can still pick MPP up.
    expect(
      mppChargeExecutor.canExecute(makeDetection({ protocol: "mpp", network: "devnet" }), wallet),
    ).toBe(true);
    expect(
      mppChargeExecutor.canExecute(
        makeDetection({ protocol: "mpp", network: "mainnet-beta" }),
        wallet,
      ),
    ).toBe(true);
  });

  it("canExecute returns false without a Solana wallet", () => {
    const detection = makeDetection({ protocol: "mpp", network: "solana-devnet" });
    expect(mppChargeExecutor.canExecute(detection, {})).toBe(false);
  });

  it("canExecute returns false for non-mpp protocols (x402 must go through its own executor)", () => {
    const detection = makeDetection({ protocol: "x402", network: "solana-devnet" });
    expect(mppChargeExecutor.canExecute(detection, wallet)).toBe(false);
  });

  it("canExecute returns false for non-Solana networks", () => {
    const detection = makeDetection({ protocol: "mpp", network: "base" });
    expect(mppChargeExecutor.canExecute(detection, wallet)).toBe(false);
  });
});

// ─── x402-solana-transfer (real USDC SPL settlement, phase R) ────────────────
//
// Live USDC transfer requires a funded ATA on the payer's wallet (no
// programmatic devnet USDC faucet exists), so the execute() path is
// exercised only in real e2e. The cascade-routing logic IS testable
// cheaply: this executor MUST decline the System-Program placeholder
// recipient the test 402 server uses by default — otherwise it would
// burn fees attempting a transfer to an account that can't hold tokens
// while preventing the memo executor from picking up downstream.

describe("x402SolanaTransferExecutor", () => {
  const SYSTEM_PROGRAM = "11111111111111111111111111111111";
  // Any valid-looking pubkey works for canExecute — the test doesn't
  // touch chain. Picked a known devnet keypair pubkey.
  const REAL_RECIPIENT = "8usJ1ShvoR3e74E6WMaNk2owwGUf87MuCuBJHdPgdEnQ";

  it("canExecute returns true with a real recipient pubkey on devnet", () => {
    const detection = makeDetection({
      protocol: "x402",
      network: "solana-devnet",
      payTo: REAL_RECIPIENT,
    });
    expect(x402SolanaTransferExecutor.canExecute(detection, wallet)).toBe(true);
  });

  it("canExecute returns true on mainnet too", () => {
    const detection = makeDetection({
      protocol: "x402",
      network: "solana-mainnet",
      payTo: REAL_RECIPIENT,
    });
    expect(x402SolanaTransferExecutor.canExecute(detection, wallet)).toBe(true);
  });

  it("canExecute returns false when recipient is the System Program placeholder", () => {
    // The test 402 server defaults RECIPIENT_ADDRESS to "1111...1" when no
    // override is set. System Program can't hold SPL tokens, so the
    // executor must decline so the cascade picks up the memo executor.
    const detection = makeDetection({
      protocol: "x402",
      network: "solana-devnet",
      payTo: SYSTEM_PROGRAM,
    });
    expect(x402SolanaTransferExecutor.canExecute(detection, wallet)).toBe(false);
  });

  it("canExecute returns false for an empty / malformed payTo", () => {
    expect(
      x402SolanaTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "solana-devnet", payTo: "" }),
        wallet,
      ),
    ).toBe(false);
    expect(
      x402SolanaTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "solana-devnet", payTo: "short" }),
        wallet,
      ),
    ).toBe(false);
  });

  it("canExecute returns false without a Solana wallet", () => {
    const detection = makeDetection({
      protocol: "x402",
      network: "solana-devnet",
      payTo: REAL_RECIPIENT,
    });
    expect(x402SolanaTransferExecutor.canExecute(detection, {})).toBe(false);
    expect(
      x402SolanaTransferExecutor.canExecute(detection, { evmPrivateKey: "0x1" }),
    ).toBe(false);
  });

  it("canExecute returns false for non-x402 protocols", () => {
    expect(
      x402SolanaTransferExecutor.canExecute(
        makeDetection({ protocol: "mpp", network: "solana-devnet", payTo: REAL_RECIPIENT }),
        wallet,
      ),
    ).toBe(false);
  });

  it("canExecute returns false for EVM networks", () => {
    expect(
      x402SolanaTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "base", payTo: REAL_RECIPIENT }),
        wallet,
      ),
    ).toBe(false);
  });
});

// ─── mpp-charge-transfer (real USDC SPL settlement for MPP, phase R.MPP) ─────
//
// Mirror of x402SolanaTransferExecutor for the MPP standard. Same
// cascade-with-graceful-fallback design: declines System-Program
// placeholder recipient so mppChargeExecutor (memo) picks up downstream.

describe("mppChargeTransferExecutor", () => {
  const SYSTEM_PROGRAM = "11111111111111111111111111111111";
  const REAL_RECIPIENT = "8usJ1ShvoR3e74E6WMaNk2owwGUf87MuCuBJHdPgdEnQ";

  it("canExecute returns true with a real recipient pubkey on devnet", () => {
    const detection = makeDetection({
      protocol: "mpp",
      network: "solana-devnet",
      payTo: REAL_RECIPIENT,
    });
    expect(mppChargeTransferExecutor.canExecute(detection, wallet)).toBe(true);
  });

  it("canExecute returns true on the legacy 'devnet' / 'mainnet-beta' aliases too", () => {
    expect(
      mppChargeTransferExecutor.canExecute(
        makeDetection({ protocol: "mpp", network: "devnet", payTo: REAL_RECIPIENT }),
        wallet,
      ),
    ).toBe(true);
    expect(
      mppChargeTransferExecutor.canExecute(
        makeDetection({ protocol: "mpp", network: "mainnet-beta", payTo: REAL_RECIPIENT }),
        wallet,
      ),
    ).toBe(true);
  });

  it("canExecute returns false for the System-Program placeholder recipient", () => {
    expect(
      mppChargeTransferExecutor.canExecute(
        makeDetection({ protocol: "mpp", network: "solana-devnet", payTo: SYSTEM_PROGRAM }),
        wallet,
      ),
    ).toBe(false);
  });

  it("canExecute returns false without a Solana wallet", () => {
    const detection = makeDetection({
      protocol: "mpp",
      network: "solana-devnet",
      payTo: REAL_RECIPIENT,
    });
    expect(mppChargeTransferExecutor.canExecute(detection, {})).toBe(false);
  });

  it("canExecute returns false for non-mpp protocols", () => {
    expect(
      mppChargeTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "solana-devnet", payTo: REAL_RECIPIENT }),
        wallet,
      ),
    ).toBe(false);
  });

  it("canExecute returns false for non-Solana networks", () => {
    expect(
      mppChargeTransferExecutor.canExecute(
        makeDetection({ protocol: "mpp", network: "base", payTo: REAL_RECIPIENT }),
        wallet,
      ),
    ).toBe(false);
  });
});

// ─── x402-evm-transfer (real ERC-20 USDC settlement on EVM, phase E) ─────────
//
// Same rationale as the Solana transfer executors: real settlement via
// `transfer(to, amount)` on the chain's USDC contract, replacing the
// unproven peer-dep-driven x402EvmExecutor. canExecute filters keep the
// cascade clean — the System-Address-equivalent placeholder for EVM is
// "0x0000…0001" which the test server uses by default.

describe("x402EvmTransferExecutor", () => {
  const EVM_PLACEHOLDER = "0x0000000000000000000000000000000000000001";
  const EVM_ZERO = "0x0000000000000000000000000000000000000000";
  const EVM_REAL_RECIPIENT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik.eth — any valid 0x-address
  const evmWallet: WalletConfig = {
    evmPrivateKey: "0x" + "11".repeat(32),
  };

  it("canExecute returns true on base-sepolia + valid recipient + EVM key", () => {
    const detection = makeDetection({
      protocol: "x402",
      network: "base-sepolia",
      payTo: EVM_REAL_RECIPIENT,
    });
    expect(x402EvmTransferExecutor.canExecute(detection, evmWallet)).toBe(true);
  });

  it("canExecute returns true on base mainnet too", () => {
    const detection = makeDetection({
      protocol: "x402",
      network: "base",
      payTo: EVM_REAL_RECIPIENT,
    });
    expect(x402EvmTransferExecutor.canExecute(detection, evmWallet)).toBe(true);
  });

  it("canExecute returns true on ethereum / ethereum-sepolia", () => {
    expect(
      x402EvmTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "ethereum", payTo: EVM_REAL_RECIPIENT }),
        evmWallet,
      ),
    ).toBe(true);
    expect(
      x402EvmTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "ethereum-sepolia", payTo: EVM_REAL_RECIPIENT }),
        evmWallet,
      ),
    ).toBe(true);
  });

  it("canExecute returns false for the test server's 0x...0001 placeholder", () => {
    expect(
      x402EvmTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "base-sepolia", payTo: EVM_PLACEHOLDER }),
        evmWallet,
      ),
    ).toBe(false);
  });

  it("canExecute returns false for the zero address", () => {
    expect(
      x402EvmTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "base-sepolia", payTo: EVM_ZERO }),
        evmWallet,
      ),
    ).toBe(false);
  });

  it("canExecute returns false for malformed addresses", () => {
    expect(
      x402EvmTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "base-sepolia", payTo: "0xnothex" }),
        evmWallet,
      ),
    ).toBe(false);
    expect(
      x402EvmTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "base-sepolia", payTo: "vitalik.eth" }),
        evmWallet,
      ),
    ).toBe(false);
    expect(
      x402EvmTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "base-sepolia", payTo: "" }),
        evmWallet,
      ),
    ).toBe(false);
  });

  it("canExecute returns false without an EVM wallet key", () => {
    const detection = makeDetection({
      protocol: "x402",
      network: "base-sepolia",
      payTo: EVM_REAL_RECIPIENT,
    });
    // wallet has only solanaPrivateKey
    expect(x402EvmTransferExecutor.canExecute(detection, wallet)).toBe(false);
    expect(x402EvmTransferExecutor.canExecute(detection, {})).toBe(false);
  });

  it("canExecute returns false for non-x402 protocols", () => {
    expect(
      x402EvmTransferExecutor.canExecute(
        makeDetection({ protocol: "mpp", network: "base-sepolia", payTo: EVM_REAL_RECIPIENT }),
        evmWallet,
      ),
    ).toBe(false);
  });

  it("canExecute returns false for Solana networks", () => {
    expect(
      x402EvmTransferExecutor.canExecute(
        makeDetection({ protocol: "x402", network: "solana-devnet", payTo: EVM_REAL_RECIPIENT }),
        evmWallet,
      ),
    ).toBe(false);
  });
});
