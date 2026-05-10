/**
 * Seed the local Convex deployment with demo data for the TUI.
 *
 * Calls the convex/seed.ts demo mutation which inserts: 1 fleet, 6 agents,
 * 30 transactions, 12 intelligence actions, 10 payment events. Idempotent
 * (runs once unless --reseed). Local-deployment only.
 *
 * Run: bun run seed
 */

import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? "http://127.0.0.1:3212";
const convex = new ConvexHttpClient(url);

async function main() {
  console.log("Seeding via", url);
  const reseed = process.argv.includes("--reseed");
  const result: { status: string; fleet_id: string; agents?: number; transactions?: number; intelligence_actions?: number } =
    await convex.mutation("seed:demo" as never, { reseed });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("seed failed:", err.message);
  process.exit(1);
});
