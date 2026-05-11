import { onboard } from "./commands/onboard.js";
import { pay } from "./commands/pay.js";
import { status } from "./commands/status.js";
import { tracesList } from "./commands/traces/list.js";
import { tracesShow } from "./commands/traces/show.js";
import { tracesReplay } from "./commands/traces/replay.js";
import { tracesVerify } from "./commands/traces/verify.js";
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
      await tracesShow(traceArgs.slice(1));
      break;
    case "replay":
      await tracesReplay(traceArgs.slice(1));
      break;
    case "verify":
      await tracesVerify(traceArgs.slice(1));
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
  ${pc.cyan("show <id>")}      Full decision context — agent, vendor, 6 rules fired, snapshot
  ${pc.cyan("replay <id>")}    Counterfactual policy override — "what if daily_limit was 10?"
  ${pc.cyan("verify <id>")}    Cryptographic anchor proof on Solana devnet — the moat
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
