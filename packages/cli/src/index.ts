import { onboard } from "./commands/onboard.js";
import { pay } from "./commands/pay.js";
import { status } from "./commands/status.js";
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
        console.log(pc.red("Usage: rhemos pay <url>"));
        process.exit(1);
      }
      await pay(args[1]);
      break;
    case "status":
      await status();
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

function printHelp() {
  console.log(`
${pc.bold("rhemos")} — the verifiable payment layer for agentic commerce

${pc.bold("Commands:")}
  ${pc.cyan("onboard")}    Set up a new fleet (wallet + agents + test payment)
  ${pc.cyan("pay <url>")}  Make a payment to a 402-protected resource
  ${pc.cyan("status")}     Show fleet status and wallet balance
  ${pc.cyan("help")}       Show this help message
`);
}

main().catch((err) => {
  console.error(pc.red(`Fatal: ${err.message}`));
  process.exit(1);
});
