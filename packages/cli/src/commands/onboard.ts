import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createRhemify } from "@rhemify-monorepo/sdk";
import pc from "picocolors";
import { saveConfig, saveWallet, walletExists, loadWallet, CONFIG_DIR } from "../config.js";

const DEFAULT_SERVER_URL = "http://localhost:8080";
const SOLANA_RPC = "https://api.devnet.solana.com";
const AIRDROP_LAMPORTS = 10_000_000; // 0.01 SOL

const AGENT_TEMPLATES = [
  { name: "Research Agent", dept: "research", skills: ["web-search", "data-analysis"] },
  { name: "Operations Agent", dept: "ops", skills: ["file-management", "scheduling"] },
  { name: "Finance Agent", dept: "finance", skills: ["invoicing", "expense-tracking"] },
];

export async function onboard() {
  console.log();
  console.log(pc.bold("  Rhemify — The verifiable payment layer for agentic commerce"));
  console.log(pc.dim("  Route. Govern. Verify.\n"));

  // Step 1: Fleet name
  const fleetName = await prompt(pc.cyan("  Fleet name: "));
  if (!fleetName) {
    console.log(pc.red("  Fleet name is required."));
    return;
  }

  // Step 2: Generate or load wallet
  let keypair: Keypair;
  if (walletExists()) {
    console.log(pc.dim("  Loading existing wallet..."));
    const bytes = loadWallet()!;
    keypair = Keypair.fromSecretKey(Uint8Array.from(bytes));
  } else {
    console.log(pc.dim("  Generating Solana wallet..."));
    keypair = Keypair.generate();
    saveWallet(Array.from(keypair.secretKey));
  }
  console.log(pc.green(`  Wallet: ${keypair.publicKey.toString()}`));

  // Step 3: Check balance
  const connection = new Connection(SOLANA_RPC, "confirmed");
  const balance = await connection.getBalance(keypair.publicKey);
  const solBalance = balance / LAMPORTS_PER_SOL;
  console.log(pc.dim(`  Balance: ${solBalance} SOL (devnet)`));

  if (solBalance < 0.001) {
    console.log(pc.yellow("  Low balance — requesting devnet SOL airdrop..."));
    try {
      const sig = await connection.requestAirdrop(keypair.publicKey, AIRDROP_LAMPORTS);
      await connection.confirmTransaction(sig, "confirmed");
      console.log(pc.green("  Airdrop received: 0.01 SOL"));
    } catch {
      console.log(
        pc.yellow(
          "  Airdrop failed (rate limited). Fund manually: solana airdrop 1 " +
            keypair.publicKey.toString() +
            " --url devnet",
        ),
      );
    }
  }

  // Step 4: Register fleet (local config — Go server integration optional)
  const fleetId = `fleet-${randomId()}`;
  const agentIds = AGENT_TEMPLATES.map((t) => `agent-${t.dept}-${randomId()}`);

  console.log();
  console.log(pc.bold("  Fleet registered:"));
  console.log(pc.dim(`  Fleet ID: ${fleetId}`));
  console.log();

  // Step 5: Create agents
  for (let i = 0; i < AGENT_TEMPLATES.length; i++) {
    const tmpl = AGENT_TEMPLATES[i];
    console.log(
      `  ${pc.green("+")} ${tmpl.name} ${pc.dim(`(${agentIds[i]})`)} — ${tmpl.skills.join(", ")}`,
    );
  }

  // Step 6: Save config
  saveConfig({
    fleetId,
    fleetName,
    agentIds,
    serverUrl: DEFAULT_SERVER_URL,
    createdAt: new Date().toISOString(),
  });

  // Step 7: Test payment (dry run — no USDC spent)
  console.log();
  console.log(pc.dim("  Running test payment (dry run)..."));
  try {
    const rhemify = createRhemify({
      serverUrl: DEFAULT_SERVER_URL,
      fleetApiKey: "onboard-test",
      agentId: agentIds[0],
      fleetId,
      wallet: { solanaPrivateKey: JSON.stringify(Array.from(keypair.secretKey)) },
      solanaRpcUrl: SOLANA_RPC,
      defaultMaxBudget: "$0.05",
    });

    const result = await rhemify.probe("https://www.x402.org/protected");
    console.log(pc.green(`  Detection: ${result.detection.protocol} on ${result.detection.network}`));
    console.log(pc.green(`  Price: ${result.detection.price}`));
    console.log(
      pc.green(`  Paths: ${result.estimatedPaths.filter((p) => p.available).length} available`),
    );
  } catch (err) {
    console.log(pc.yellow(`  Test probe skipped: ${err instanceof Error ? err.message : String(err)}`));
  }

  // Step 8: Print results
  console.log();
  console.log(pc.bold(pc.green("  Setup complete.")));
  console.log();
  console.log(pc.dim("  Config saved to: ") + CONFIG_DIR);
  console.log(pc.dim("  Dashboard: ") + "http://localhost:3001/dashboard");
  console.log();
  console.log(pc.bold("  MCP config (add to your agent):"));
  console.log(pc.dim("  ─────────────────────────────────"));
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          rhemify: {
            command: "bunx",
            args: ["rhemify-mcp"],
            env: {
              RHEMIFY_SERVER_URL: DEFAULT_SERVER_URL,
              RHEMIFY_FLEET_API_KEY: "your-fleet-api-key",
              RHEMIFY_AGENT_ID: agentIds[0],
              RHEMIFY_FLEET_ID: fleetId,
            },
          },
        },
      },
      null,
      2,
    ),
  );
  console.log();
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function prompt(message: string): Promise<string> {
  process.stdout.write(message);
  for await (const line of console) {
    return line.trim();
  }
  return "";
}
