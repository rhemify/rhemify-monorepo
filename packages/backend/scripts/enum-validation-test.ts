/**
 * Live proof: Phase I's tightened enum validators reject invalid values
 * at the Convex runtime boundary.
 *
 * Runs against the local Convex deployment booted by `bunx convex dev`
 * (port 3210). Inserts three payment_events records:
 *
 *   1. valid standard + outcome              → must succeed (returns id)
 *   2. invalid standard "bitcoin"            → must reject (ArgumentValidationError)
 *   3. invalid outcome "maybe"               → must reject (ArgumentValidationError)
 *
 * Run from /packages/backend/:
 *   bun run scripts/enum-validation-test.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const url = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const client = new ConvexHttpClient(url);

async function main() {
  console.log("Testing against:", url);
  console.log();

  // ── Test 1: VALID standard + outcome ────────────────────────────────
  console.log("[1] events.insert with standard='x402', outcome='success'  (expect: SUCCESS)");
  const goodId = await client.mutation(api.events.insert, {
    agent_id: "test-agent-1",
    fleet_id: "test-fleet-1",
    standard: "x402",
    amount: 1.0,
    token: "USDC",
    chain: "base",
    domain: "example.com",
    outcome: "success",
    instrument_type: "ows",
    trace_id: `trc_${Date.now()}_good`,
  });
  console.log("    inserted id:", goodId);
  console.log();

  // ── Test 2: INVALID standard ────────────────────────────────────────
  console.log("[2] events.insert with standard='bitcoin' (NOT in enum)   (expect: REJECTION)");
  let rejected1 = false;
  let err1Msg = "";
  try {
    await client.mutation(api.events.insert, {
      agent_id: "test-agent-2",
      fleet_id: "test-fleet-1",
      // @ts-expect-error — deliberately invalid to test runtime rejection
      standard: "bitcoin",
      amount: 1.0,
      token: "USDC",
      chain: "base",
      domain: "example.com",
      outcome: "success",
      instrument_type: "ows",
      trace_id: `trc_${Date.now()}_bad_std`,
    });
  } catch (err: unknown) {
    rejected1 = true;
    err1Msg = (err as Error).message;
    const firstLine = err1Msg.split("\n").find((l) => l.includes("standard") || l.includes("Validator")) ?? err1Msg.split("\n")[0];
    console.log("    rejected:", firstLine);
  }
  if (!rejected1) {
    console.error("    FAIL: invalid standard 'bitcoin' was accepted");
    process.exit(1);
  }
  console.log();

  // ── Test 3: INVALID outcome ─────────────────────────────────────────
  console.log("[3] events.insert with outcome='maybe' (NOT in enum)      (expect: REJECTION)");
  let rejected2 = false;
  try {
    await client.mutation(api.events.insert, {
      agent_id: "test-agent-3",
      fleet_id: "test-fleet-1",
      standard: "x402",
      amount: 1.0,
      token: "USDC",
      chain: "base",
      domain: "example.com",
      // @ts-expect-error — deliberately invalid to test runtime rejection
      outcome: "maybe",
      instrument_type: "ows",
      trace_id: `trc_${Date.now()}_bad_out`,
    });
  } catch (err: unknown) {
    rejected2 = true;
    const msg = (err as Error).message;
    const firstLine = msg.split("\n").find((l) => l.includes("outcome") || l.includes("Validator")) ?? msg.split("\n")[0];
    console.log("    rejected:", firstLine);
  }
  if (!rejected2) {
    console.error("    FAIL: invalid outcome 'maybe' was accepted");
    process.exit(1);
  }
  console.log();

  console.log("All assertions passed. Phase I enum validators are load-bearing at runtime.");
  console.log("  valid payment_events id created:", goodId);
  console.log("  invalid standard rejected by Convex validator");
  console.log("  invalid outcome rejected by Convex validator");
}

main().catch((err: unknown) => {
  console.error("Test runner error:", (err as Error).message);
  process.exit(1);
});
