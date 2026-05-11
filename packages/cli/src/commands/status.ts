import pc from "picocolors";
import { loadConfig, loadWallet } from "../config.js";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

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
    const balance = await connection.getBalance(keypair.publicKey);
    console.log();
    console.log(pc.bold("  Wallet:"));
    console.log(pc.dim(`    Address: ${keypair.publicKey.toString()}`));
    console.log(pc.dim(`    SOL: ${(balance / LAMPORTS_PER_SOL).toFixed(4)}`));
  }

  console.log();
}
