import { createRhemify } from "@rhemify-monorepo/sdk";
import pc from "picocolors";
import { loadConfig, loadEvmWallet, loadWallet } from "../config.js";

interface PayArgs {
  url?: string;
  dryRun: boolean;
  maxBudget: string;
  taskContext: string;
}

function parseArgs(argv: string[]): PayArgs {
  const out: PayArgs = { dryRun: false, maxBudget: "$0.10", taskContext: "CLI payment" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--max-budget") {
      const v = argv[++i];
      if (!v) throw new Error("--max-budget requires a value (e.g. '$0.50')");
      out.maxBudget = v;
    } else if (arg === "--task-context") {
      const v = argv[++i];
      if (!v) throw new Error("--task-context requires a string");
      out.taskContext = v;
    } else if (arg && !arg.startsWith("--") && !out.url) {
      out.url = arg;
    } else if (arg !== undefined) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out.url) throw new Error("Usage: rhemify pay <url> [--dry-run] [--max-budget <amount>]");
  return out;
}

export async function pay(...argv: string[]) {
  let args: PayArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.log(pc.red(`  ${(err as Error).message}`));
    process.exit(2);
  }

  const config = loadConfig();
  const wallet = loadWallet();
  const evmWallet = loadEvmWallet();

  if (!config || !wallet) {
    console.log(pc.red("  Not set up. Run: rhemify onboard"));
    return;
  }

  console.log(pc.dim(`  Paying: ${args.url}${args.dryRun ? pc.yellow(" [DRY RUN]") : ""}`));
  if (evmWallet) {
    console.log(pc.dim(`  EVM wallet: ${evmWallet.address} (Base/Sepolia/Ethereum capable)`));
  }

  const rhemify = createRhemify({
    serverUrl: config.serverUrl,
    fleetApiKey: config.fleetApiKey ?? "cli-user",
    agentId: config.agentIds[0]!,
    fleetId: config.fleetId,
    wallet: {
      solanaPrivateKey: JSON.stringify(wallet),
      // EVM key only included when a wallet-evm.json exists. Without it the
      // EVM executors decline at canExecute (wallet.evmPrivateKey absent) and
      // the cascade falls through to the next eligible Solana path.
      ...(evmWallet ? { evmPrivateKey: evmWallet.privateKey } : {}),
    },
    solanaRpcUrl: "https://api.devnet.solana.com",
    defaultMaxBudget: "$1.00",
    onError: (err: Error) => {
      console.error(pc.yellow(`  [ingest] ${err.message}`));
    },
  });

  try {
    const result = await rhemify.pay(args.url!, {
      taskContext: args.taskContext,
      maxBudget: args.maxBudget,
      dryRun: args.dryRun,
    });

    console.log(pc.green(`  Payment ${result.success ? "succeeded" : "failed"}`));
    console.log(pc.dim(`  Protocol: ${result.detection.protocol}`));
    console.log(pc.dim(`  Price: ${result.detection.price}`));
    console.log(pc.dim(`  Trace: ${result.trace.id}`));
    console.log(pc.dim(`  Hash: ${result.trace.traceHash.slice(0, 16)}...`));
    if (result.receipt.txHash) {
      console.log(pc.dim(`  TxHash: ${result.receipt.txHash}`));
    }
    if (args.dryRun) {
      console.log(pc.yellow(`  Dry run — no chain submit. Inspect trace:`));
      console.log(`    ${pc.cyan(`rhemify traces show ${result.trace.id}`)}`);
    } else {
      // Layer-1 Memo anchor is queued by pay() but processed by a 2s
      // background tick. Without awaiting close() the CLI exits before the
      // tick fires and `payment_traces.anchor_tx_hash` stays null in Convex.
      // See packages/sdk/src/anchor/queue.ts.
      console.log(pc.dim(`  Anchoring trace hash (Layer 1)...`));
      await rhemify.close();
      console.log(pc.dim(`  Done. Inspect: ${pc.cyan(`rhemify traces show ${result.trace.id}`)}`));
    }
  } catch (err) {
    // Best-effort drain on error too — a partially-succeeded pay() may
    // already have enqueued a Memo anchor for a different trace_id.
    await rhemify.close().catch(() => {});
    console.log(pc.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}
