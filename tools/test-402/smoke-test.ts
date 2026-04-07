/**
 * E2E smoke test: SDK → test 402 server → Go server → Convex
 *
 * Prerequisites:
 *   1. Test 402 server running: bun run tools/test-402/server.ts
 *   2. Go server running:       cd apps/server && go run ./cmd/server
 *
 * Usage: bun run tools/test-402/smoke-test.ts
 */

import { createRhemify, PolicyBlockedError, DetectionError } from "../../packages/sdk/src/index.js";

const TEST_402_URL = process.env.TEST_402_URL ?? "http://localhost:3402";
const GO_SERVER_URL = process.env.GO_SERVER_URL ?? "http://localhost:8080";

const rhemify = createRhemify({
  serverUrl: GO_SERVER_URL,
  fleetApiKey: "test-fleet-key",
  agentId: "agent-smoke-test",
  fleetId: "fleet-smoke-test",
  wallet: {
    // Use env key if available, otherwise a dummy key so path resolver finds paths for dry runs
    solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY ?? "dummy-key-for-dry-run-only",
    evmPrivateKey: process.env.EVM_PRIVATE_KEY ?? "0xdummy-key-for-dry-run-only",
  },
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  defaultMaxBudget: "$10.00",
});

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (err) {
    console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  console.log("\n🧪 Rhemify SDK Smoke Test\n");
  console.log(`  Test 402 server: ${TEST_402_URL}`);
  console.log(`  Go server:       ${GO_SERVER_URL}\n`);

  // --- Test 1: Health check on test server ---
  await test("Test 402 server is running", async () => {
    const res = await fetch(`${TEST_402_URL}/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== "ok") throw new Error("Unhealthy");
  });

  // --- Test 2: Probe x402 endpoint ---
  await test("probe() detects x402 on /stock-data", async () => {
    const result = await rhemify.probe(`${TEST_402_URL}/stock-data`);
    if (result.detection.protocol !== "x402") {
      throw new Error(`Expected x402, got ${result.detection.protocol}`);
    }
    if (!result.canPay && result.policyDecision.action !== "block") {
      // canPay can be false if no wallet — that's OK for this test
    }
    console.log(`       Protocol: ${result.detection.protocol}`);
    console.log(`       Price: ${result.detection.price}`);
    console.log(`       Network: ${result.detection.network}`);
    console.log(`       Can pay: ${result.canPay}`);
    console.log(`       Paths: ${result.estimatedPaths.filter(p => p.available).length} available`);
  });

  // --- Test 3: Probe MPP endpoint ---
  await test("probe() detects MPP on /analytics", async () => {
    const result = await rhemify.probe(`${TEST_402_URL}/analytics`);
    if (result.detection.protocol !== "mpp") {
      throw new Error(`Expected mpp, got ${result.detection.protocol}`);
    }
    console.log(`       Protocol: ${result.detection.protocol}`);
    console.log(`       Price: ${result.detection.price}`);
  });

  // --- Test 4: Probe Base endpoint ---
  await test("probe() detects x402 on Base for /weather", async () => {
    const result = await rhemify.probe(`${TEST_402_URL}/weather`);
    if (result.detection.protocol !== "x402") {
      throw new Error(`Expected x402, got ${result.detection.protocol}`);
    }
    if (result.detection.network !== "base-sepolia") {
      throw new Error(`Expected base-sepolia, got ${result.detection.network}`);
    }
    console.log(`       Network: ${result.detection.network}`);
  });

  // --- Test 5: Dry run pay() ---
  await test("pay() dry run on /stock-data", async () => {
    const result = await rhemify.pay(`${TEST_402_URL}/stock-data`, {
      dryRun: true,
      taskContext: "Smoke test — researching stock data",
      taskStep: 1,
    });
    if (!result.success) throw new Error("Expected success");
    if (!result.trace.id.startsWith("trc_")) {
      throw new Error(`Invalid trace ID: ${result.trace.id}`);
    }
    if (result.trace.traceHash.length !== 64) {
      throw new Error(`Invalid trace hash length: ${result.trace.traceHash.length}`);
    }
    console.log(`       Trace ID: ${result.trace.id}`);
    console.log(`       Hash: ${result.trace.traceHash.slice(0, 16)}...`);
    console.log(`       Path: ${result.trace.chosenPath.instrument}`);
    console.log(`       Rules: ${result.trace.policyRulesFired.length} evaluated`);
    console.log(`       Alternatives: ${result.trace.alternativesEvaluated.length} paths`);
  });

  // --- Test 6: Non-402 URL should throw DetectionError ---
  await test("pay() throws DetectionError on non-402", async () => {
    try {
      await rhemify.pay(`${TEST_402_URL}/health`, { dryRun: true });
      throw new Error("Should have thrown");
    } catch (err) {
      if (err instanceof DetectionError) return; // expected
      throw err;
    }
  });

  // --- Test 7: Go server health (optional) ---
  await test("Go server is running (optional)", async () => {
    const res = await fetch(`${GO_SERVER_URL}/api/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    console.log(`       Status: ${data.status}`);
  });

  // --- Test 8: Fleet status via SDK ---
  await test("status() calls Go server (optional)", async () => {
    const status = await rhemify.status();
    console.log(`       Agent: ${status.agentId}`);
  });

  console.log("\n🏁 Smoke test complete.\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
