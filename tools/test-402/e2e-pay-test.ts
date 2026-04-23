/**
 * E2E payment test against real 402 endpoints.
 * Makes ONE real payment to x402.org/protected (0.01 USDC devnet).
 * All other tests use dry runs (no payment).
 *
 * Prerequisites:
 *   - Funded Solana devnet wallet at .test-wallet.json
 *
 * Usage: bun run tools/test-402/e2e-pay-test.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRhemify } from "../../packages/sdk/src/index.js";

const WALLET_PATH = resolve(import.meta.dirname, "../../.test-wallet.json");

// Load wallet keypair (JSON array format from solana-keygen)
let solanaPrivateKey: string;
try {
  const raw = readFileSync(WALLET_PATH, "utf-8");
  solanaPrivateKey = raw.trim(); // JSON array string
} catch {
  console.error("❌ No wallet found at .test-wallet.json. Run solana-keygen first.");
  process.exit(1);
}

const rhemify = createRhemify({
  serverUrl: "http://localhost:8080", // Go server (optional — falls back gracefully)
  fleetApiKey: "test-fleet-key",
  agentId: "agent-e2e-test",
  fleetId: "fleet-e2e-test",
  wallet: { solanaPrivateKey },
  solanaRpcUrl: "https://api.devnet.solana.com",
  defaultMaxBudget: "$0.05", // Safety cap: max $0.05 per payment
});

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

async function main() {
  console.log("\n💰 E2E Payment Test (real devnet USDC)\n");

  // --- Test 1: Dry run x402 Solana (no payment, full pipeline) ---
  await test("dry run: x402 Solana devnet /stock-data (local server)", async () => {
    // Uses local test server if running, otherwise skip
    try {
      const res = await fetch("http://localhost:3402/health");
      if (!res.ok) throw new Error("skip");
    } catch {
      console.log("       (local test server not running — skipped)");
      return;
    }

    const result = await rhemify.pay("http://localhost:3402/stock-data", {
      dryRun: true,
      taskContext: "E2E test — dry run x402 Solana",
    });
    if (!result.success) throw new Error("Expected success");
    if (!result.trace.id.startsWith("trc_")) throw new Error("Bad trace ID");
    console.log(`       Trace: ${result.trace.id}, Path: ${result.trace.chosenPath.instrument}`);
  });

  // --- Test 2: Probe real x402.org (detection + policy, no payment) ---
  await test("probe: x402.org/protected (detection only)", async () => {
    const result = await rhemify.probe("https://www.x402.org/protected");
    if (result.detection.protocol !== "x402") {
      throw new Error(`Expected x402, got ${result.detection.protocol}`);
    }
    console.log(`       Protocol: ${result.detection.protocol}, Price: ${result.detection.price}`);
    console.log(`       Paths available: ${result.estimatedPaths.filter(p => p.available).length}`);
  });

  // --- Test 3: ONE real payment to x402.org (0.01 USDC) ---
  // This is the only test that spends real devnet USDC
  await test("REAL PAYMENT: x402.org/protected (0.01 USDC devnet)", async () => {
    const result = await rhemify.pay("https://www.x402.org/protected", {
      maxBudget: "$0.02", // 0.02 USD cap for safety
      taskContext: "E2E test — real x402 payment to x402.org",
      taskStep: 1,
    });

    if (!result.success) throw new Error("Payment failed");
    console.log(`       Trace: ${result.trace.id}`);
    console.log(`       Hash: ${result.trace.traceHash.slice(0, 16)}...`);
    console.log(`       Path: ${result.trace.chosenPath.instrument}`);
    console.log(`       TxHash: ${result.receipt.txHash ?? "(none)"}`);
    console.log(`       Data: ${JSON.stringify(result.data).slice(0, 100)}`);
  });

  console.log(`\n🏁 E2E test complete. ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
