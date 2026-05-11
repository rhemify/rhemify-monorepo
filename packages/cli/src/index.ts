import { onboard } from "./commands/onboard.js";
import { pay } from "./commands/pay.js";
import { status } from "./commands/status.js";
import { tracesList } from "./commands/traces/list.js";
import pc from "picocolors";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "onboard":
      await onboard();
      break;
    case "pay":
      if (!args[1]) {
        console.log(pc.red("Usage: rhemify pay <url>"));
        process.exit(1);
      }
      await pay(args[1]);
      break;
    case "status":
      await status();
      break;
    case "traces":
      await tracesDispatch(args.slice(1));
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      if (command) {
        console.log(pc.red(`Unknown command: ${command}\n`));
      }
      printHelp();
      break;
  }
}

async function tracesDispatch(traceArgs: string[]) {
  const sub = traceArgs[0];
  switch (sub) {
    case "list":
      await tracesList(traceArgs.slice(1));
      break;
    case "show":
    case "replay":
    case "verify":
      console.log(pc.yellow(`  '${sub}' coming in a later chunk (Phase N.${sub === "show" ? "2" : sub === "replay" ? "3" : "4"}).`));
      console.log(pc.dim(`  See docs/superpowers/specs/2026-04-15-replay-engine-design.md for the spec.`));
      process.exit(0);
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printTracesHelp();
      break;
    default:
      console.log(pc.red(`  Unknown traces subcommand: ${sub}\n`));
      printTracesHelp();
      process.exit(1);
  }
}

function printTracesHelp() {
  console.log(`
${pc.bold("rhemify traces")} — browse, inspect, replay, and verify decision traces

${pc.bold("Subcommands:")}
  ${pc.cyan("list")}    Browse recent decision traces (entry point)
  ${pc.dim("show")}    Coming in Phase N.2 — full decision context
  ${pc.dim("replay")}  Coming in Phase N.3 — counterfactual policy override
  ${pc.dim("verify")}  Coming in Phase N.4 — Merkle proof against Solana anchor
`);
}

function printHelp() {
  console.log(`
${pc.bold("rhemify")} — the verifiable payment layer for agentic commerce

${pc.bold("Commands:")}
  ${pc.cyan("onboard")}        Set up a new fleet (wallet + agents + test payment)
  ${pc.cyan("pay <url>")}      Make a payment to a 402-protected resource
  ${pc.cyan("status")}         Show fleet status and wallet balance
  ${pc.cyan("traces <verb>")}  Browse / inspect / replay / verify decision traces
  ${pc.cyan("help")}           Show this help message
`);
}

main().catch((err) => {
  console.error(pc.red(`Fatal: ${err.message}`));
  process.exit(1);
});
