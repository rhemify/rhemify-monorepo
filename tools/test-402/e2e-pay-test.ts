/**
 * E2E payment test against real 402 endpoints.
 * Makes ONE real payment to x402.org/protected (0.01 USDC devnet).
 * All other tests use dry runs (no payment).
 *
 * Loads the same fleet credentials + Solana wallet the production CLI uses
 * (`~/.rhemify/config.json` + `~/.rhemify/wallet.json`). The previous
 * hardcoded `test-fleet-key` / `fleet-e2e-test` values did not resolve in
 * Convex's `fleets` table, so every ingest + anchor PATCH 401'd silently and
 * Test 3's anchor never appeared in `payment_traces.anchor_tx_hash`. Reusing
 * the onboarded fleet means this harness exercises the same auth path
 * production traffic does.
 *
 * Prerequisites:
 *   - `rhemify onboard` has been run (writes `~/.rhemify/config.json` +
 *     `~/.rhemify/wallet.json`)
 *   - Onboarded wallet funded with devnet SOL + USDC (faucet.circle.com)
 *   - Go server (`apps/server`) running on the port in config.serverUrl
 *   - `bunx convex dev` running in `packages/backend`
 *
 * Usage: bun run tools/test-402/e2e-pay-test.ts
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRhemify } from "../../packages/sdk/src/index.js";

const CONFIG_PATH = join(homedir(), ".rhemify", "config.json");
const WALLET_PATH = join(homedir(), ".rhemify", "wallet.json");

interface RhemifyCliConfig {
  fleetId: string;
  fleetName: string;
  agentIds: string[];
  serverUrl: string;
  convexUrl?: string;
  fleetApiKey?: string;
}

let cliConfig: RhemifyCliConfig;
try {
  cliConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as RhemifyCliConfig;
} catch {
  console.error(`❌ Missing ${CONFIG_PATH}. Run: bun run packages/cli/src/index.ts onboard`);
  process.exit(1);
}
if (!cliConfig.fleetApiKey) {
  console.error(`❌ ${CONFIG_PATH} missing fleetApiKey. Re-run onboard or set the key manually.`);
  process.exit(1);
}
if (!cliConfig.agentIds[0]) {
  console.error(`❌ ${CONFIG_PATH} has no agentIds. Re-run onboard.`);
  process.exit(1);
}

let solanaPrivateKey: string;
try {
  solanaPrivateKey = readFileSync(WALLET_PATH, "utf-8").trim();
} catch {
  console.error(`❌ Missing ${WALLET_PATH}. Run: bun run packages/cli/src/index.ts onboard`);
  process.exit(1);
}

const rhemify = createRhemify({
  serverUrl: cliConfig.serverUrl,
  fleetApiKey: cliConfig.fleetApiKey,
  agentId: cliConfig.agentIds[0],
  fleetId: cliConfig.fleetId,
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
  // Drain Layer-1 Memo anchors + ingest backlog BEFORE setting exit code.
  // `process.exit()` would terminate Node before the AnchorQueue's flush
  // completes, dropping the on-chain Memo tx and leaving
  // `payment_traces.anchor_tx_hash` null in Convex. Use `process.exitCode`
  // so Node drains the event loop first. See packages/sdk/src/anchor/queue.ts
  // and packages/sdk/src/client.ts:close().
  await rhemify.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  // Even on fatal error, drain any pending anchor work — the partial pay()
  // may have already enqueued a Memo for a successful test.
  await rhemify.close().catch(() => {});
  process.exitCode = 1;
});
