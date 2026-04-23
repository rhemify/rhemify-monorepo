import { createRhemify } from "@rhemify-monorepo/sdk";
import pc from "picocolors";
import { loadConfig, loadWallet } from "../config.js";

export async function pay(url: string) {
  const config = loadConfig();
  const wallet = loadWallet();

  if (!config || !wallet) {
    console.log(pc.red("  Not set up. Run: rhemify onboard"));
    return;
  }

  console.log(pc.dim(`  Paying: ${url}`));

  const rhemify = createRhemify({
    serverUrl: config.serverUrl,
    fleetApiKey: "cli-user",
    agentId: config.agentIds[0],
    fleetId: config.fleetId,
    wallet: { solanaPrivateKey: JSON.stringify(wallet) },
    solanaRpcUrl: "https://api.devnet.solana.com",
    defaultMaxBudget: "$1.00",
  });

  try {
    const result = await rhemify.pay(url, {
      taskContext: "CLI payment",
      maxBudget: "$0.10",
    });

    console.log(pc.green(`  Payment ${result.success ? "succeeded" : "failed"}`));
    console.log(pc.dim(`  Protocol: ${result.detection.protocol}`));
    console.log(pc.dim(`  Price: ${result.detection.price}`));
    console.log(pc.dim(`  Trace: ${result.trace.id}`));
    console.log(pc.dim(`  Hash: ${result.trace.traceHash.slice(0, 16)}...`));
    if (result.receipt.txHash) {
      console.log(pc.dim(`  TxHash: ${result.receipt.txHash}`));
    }
  } catch (err) {
    console.log(pc.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}
