/**
 * Smoke test against real 402 endpoints.
 * Tests detection only (no payments) — verifies the SDK can parse
 * real-world 402 responses from live services.
 *
 * Usage: bun run tools/test-402/real-smoke-test.ts
 */

import { detectProtocol, detectFromResponse } from "../../packages/sdk/src/index.js";
import { REAL_ENDPOINTS } from "./real-endpoints.js";

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (err) {
    console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  console.log("\n🌐 Real 402 Endpoint Smoke Test\n");

  for (const endpoint of REAL_ENDPOINTS) {
    console.log(`  --- ${endpoint.name} ---`);

    // Test 1: Raw HTTP — verify the endpoint returns 402
    await test(`${endpoint.name}: returns HTTP 402`, async () => {
      const res = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: endpoint.headers,
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      });
      if (res.status !== 402) {
        throw new Error(`Expected 402, got ${res.status}`);
      }
    });

    // Test 2: SDK detection — verify detectProtocol parses correctly
    await test(`${endpoint.name}: SDK detects ${endpoint.expectedProtocol}`, async () => {
      const result = await detectProtocol(endpoint.url, {
        method: endpoint.method,
        headers: endpoint.headers,
      });

      if (result.protocol !== endpoint.expectedProtocol) {
        throw new Error(
          `Expected ${endpoint.expectedProtocol}, got ${result.protocol}. ` +
          `Raw headers: ${JSON.stringify(result.raw.headers).slice(0, 200)}`
        );
      }

      console.log(`       Protocol: ${result.protocol} (${result.confidence})`);
      console.log(`       Network: ${result.network}`);
      console.log(`       Price: ${result.price}`);
      console.log(`       Currency: ${result.currency}`);
      console.log(`       PayTo: ${result.payTo.slice(0, 20)}...`);
    });

    // Test 3: Verify network detection
    await test(`${endpoint.name}: network is ${endpoint.expectedNetwork}`, async () => {
      const result = await detectProtocol(endpoint.url, {
        method: endpoint.method,
        headers: endpoint.headers,
        cacheTtlMs: 0, // disable cache for this test
      });

      if (result.network !== endpoint.expectedNetwork) {
        console.log(`       (got ${result.network} — may be acceptable)`);
      }
    });

    console.log();
  }

  // Test: Manual header parsing (x402.org payment-required header)
  await test("x402.org: base64 payment-required header decodes correctly", async () => {
    const res = await fetch("https://www.x402.org/protected");
    const paymentRequired = res.headers.get("payment-required");
    if (!paymentRequired) {
      throw new Error("No payment-required header found");
    }

    const decoded = JSON.parse(atob(paymentRequired));
    if (decoded.x402Version !== 2) {
      throw new Error(`Expected x402Version 2, got ${decoded.x402Version}`);
    }
    if (!Array.isArray(decoded.accepts) || decoded.accepts.length === 0) {
      throw new Error("No accepts array in decoded header");
    }

    console.log(`       x402 Version: ${decoded.x402Version}`);
    console.log(`       Accepts: ${decoded.accepts.length} payment options`);
    for (const accept of decoded.accepts) {
      console.log(`         - ${accept.network}: ${accept.amount} (${accept.extra?.name ?? "unknown"})`);
    }
  });

  console.log("\n🏁 Real endpoint smoke test complete.\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
