import pc from "picocolors";
import { loadConfig, loadEvmWallet, loadWallet, resolveConvexUrl } from "../config.js";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * Pre-flight diagnostic: fleet identity, wallet balance, and the three
 * services the demo flow depends on. Print one line per check so a judge
 * running `rhemify status` before the demo can see at a glance whether
 * everything is up.
 */
export async function status() {
  const config = loadConfig();
  const wallet = loadWallet();

  if (!config) {
    console.log(pc.red("  Not set up. Run: rhemify onboard"));
    return;
  }

  console.log();
  console.log(pc.bold(`  Fleet: ${config.fleetName}`));
  console.log(pc.dim(`  ID: ${config.fleetId}`));
  console.log(pc.dim(`  Created: ${config.createdAt}`));
  console.log(pc.dim(`  Server: ${config.serverUrl}`));
  console.log();

  console.log(pc.bold("  Agents:"));
  for (const id of config.agentIds) {
    console.log(`    ${pc.green("●")} ${id}`);
  }

  if (wallet) {
    const keypair = await import("@solana/web3.js").then((m) =>
      m.Keypair.fromSecretKey(Uint8Array.from(wallet)),
    );
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    let balance = 0;
    try {
      balance = await connection.getBalance(keypair.publicKey);
    } catch (err) {
      console.log();
      console.log(pc.bold("  Wallet:"));
      console.log(pc.dim(`    Address: ${keypair.publicKey.toString()}`));
      console.log(pc.yellow(`    SOL: balance lookup failed — ${(err as Error).message}`));
      balance = -1;
    }
    if (balance >= 0) {
      console.log();
      console.log(pc.bold("  Wallet:"));
      console.log(pc.dim(`    Address: ${keypair.publicKey.toString()}`));
      console.log(pc.dim(`    SOL: ${(balance / LAMPORTS_PER_SOL).toFixed(4)}`));
    }
  }

  // Optional EVM wallet — only shown if the user has generated one. The
  // section is a check-in for the EVM e2e path: if the address is funded
  // with Base Sepolia ETH + USDC, x402EvmTransferExecutor will activate.
  const evmWallet = loadEvmWallet();
  if (evmWallet) {
    console.log();
    console.log(pc.bold("  EVM Wallet:"));
    console.log(pc.dim(`    Address: ${evmWallet.address}`));
    console.log(
      pc.dim(
        "    Fund via: faucet.circle.com (Base Sepolia USDC) + Coinbase faucet (Base Sepolia ETH)",
      ),
    );
  }

  // --- Service reachability checks ---
  //
  // Three dependencies the demo flow needs: the Go intelligence server,
  // the Convex deployment (CLI reads it for `traces list/show`), and the
  // local test 402 server (only if it's expected to be running — never
  // mandatory, so a 'down' here is informational, not a failure).
  console.log();
  console.log(pc.bold("  Services:"));
  await Promise.all([
    check("Go server", `${config.serverUrl}/api/health`, "json"),
    check("Convex", `${resolveConvexUrl()}/api/query`, "post-empty"),
    check("Test 402", "http://localhost:3402/health", "json"),
  ]);

  console.log();
}

/**
 * One-line reachability check with a 2.5s timeout. Three probe modes:
 *   json        — GET and accept any 2xx with JSON body
 *   post-empty  — POST {} and accept any response (Convex's /api/query
 *                 returns 400 on empty body but the TCP RTT confirms the
 *                 deployment is up; we treat anything that isn't a network
 *                 error as reachable)
 */
async function check(label: string, url: string, mode: "json" | "post-empty") {
  const padded = `    ${label.padEnd(10)}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const init: RequestInit = mode === "post-empty"
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal }
      : { method: "GET", signal: controller.signal };
    const res = await fetch(url, init);
    clearTimeout(timer);
    const ms = Date.now() - start;
    const reachable = mode === "post-empty" ? true : res.ok;
    if (reachable) {
      console.log(`${padded} ${pc.green("●")} reachable ${pc.dim(`(${ms}ms, ${url})`)}`);
    } else {
      console.log(`${padded} ${pc.yellow("●")} HTTP ${res.status} ${pc.dim(`(${ms}ms, ${url})`)}`);
    }
  } catch (err) {
    const msg = (err as Error).message;
    const reason = msg.includes("aborted") ? "timeout" : msg.includes("ECONNREFUSED") ? "not running" : msg;
    console.log(`${padded} ${pc.red("○")} ${reason} ${pc.dim(`(${url})`)}`);
  }
}
