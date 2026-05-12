/**
 * `rhemify traces list [--limit N] [--agent <id>] [--blocked-only] [--json]`
 *
 * Browse-first surface for decision traces. Reads from Convex directly via
 * the HTTP client (matches the read-path pattern Phase M established in
 * apps/tui/). Renders a table of recent traces with their decision
 * outcome — the CFO copies a trace_id from here, then runs `traces show`
 * or `traces replay`.
 *
 * Output format:
 *   - default: pretty terminal table (picocolors), copy-friendly trace_id column
 *   - `--json`: raw array for jq piping
 */

import { ConvexHttpClient } from "convex/browser";
import pc from "picocolors";
import { resolveConvexUrl } from "../../config.js";

interface TraceRow {
  _id: string;
  trace_id: string;
  _creationTime: number;
  confidence: "high" | "medium" | "low";
  decision: "allowed" | "blocked";
  agent_id: string | null;
  domain: string | null;
  amount: number | null;
  standard: string | null;
  outcome: string | null;
  anchor_tx_hash: string | null;
}

interface ListArgs {
  limit?: number;
  agentId?: string;
  blockedOnly?: boolean;
  json?: boolean;
  convexUrl?: string;
}

function parseArgs(argv: string[]): ListArgs {
  const out: ListArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") {
      const v = argv[++i];
      if (!v) throw new Error("--limit requires a value");
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`--limit must be a positive number, got: ${v}`);
      out.limit = n;
    } else if (arg === "--agent") {
      const v = argv[++i];
      if (!v) throw new Error("--agent requires a value");
      out.agentId = v;
    } else if (arg === "--blocked-only") {
      out.blockedOnly = true;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--convex") {
      const v = argv[++i];
      if (!v) throw new Error("--convex requires a URL");
      out.convexUrl = v;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg !== undefined) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`
${pc.bold("rhemify traces list")} — list recent decision traces

${pc.bold("Usage:")}
  rhemify traces list [options]

${pc.bold("Options:")}
  --limit <n>       max rows to return (default 20, max 100)
  --agent <id>      filter to traces from a specific agent
  --blocked-only    only show traces whose policy decision was "blocked"
  --json            output raw JSON instead of pretty table (for jq piping)
  --convex <url>    override Convex deployment URL (else uses config/env)
  -h, --help        show this message

${pc.bold("Examples:")}
  rhemify traces list
  rhemify traces list --limit 5
  rhemify traces list --blocked-only
  rhemify traces list --json | jq '.[].trace_id'
`);
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, Math.max(0, n - 1)) + "…";
  return s + " ".repeat(n - s.length);
}

function formatTimestamp(ms: number): string {
  // YYYY-MM-DD HH:MM:SS local — what a human reading a table actually wants.
  const d = new Date(ms);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}`;
}

function decisionBadge(decision: "allowed" | "blocked"): string {
  if (decision === "blocked") return pc.red("blocked ");
  return pc.green("allowed ");
}

function outcomeBadge(outcome: string | null): string {
  if (outcome === "success") return pc.green(pad("success", 9));
  if (outcome === "rejected") return pc.red(pad("rejected", 9));
  if (outcome === "failed") return pc.yellow(pad("failed", 9));
  return pc.dim(pad(outcome ?? "—", 9));
}

function renderTable(rows: TraceRow[]): void {
  if (rows.length === 0) {
    console.log(pc.dim("\n  No traces found.\n"));
    console.log(pc.dim("  If your local Convex was just seeded, give it a moment."));
    console.log(pc.dim("  To seed: cd apps/tui && bun run seed --reseed\n"));
    return;
  }

  // Header
  const header = [
    pc.bold(pad("trace_id", 28)),
    pc.bold(pad("when", 17)),
    pc.bold(pad("agent_id", 26)),
    pc.bold(pad("vendor", 18)),
    pc.bold(pad("std", 5)),
    pc.bold(pad("amount", 9)),
    pc.bold(pad("decision", 9)),
    pc.bold(pad("outcome", 9)),
  ].join(" ");
  const divider = pc.dim(
    [
      "─".repeat(27),
      "─".repeat(16),
      "─".repeat(25),
      "─".repeat(17),
      "─".repeat(4),
      "─".repeat(8),
      "─".repeat(8),
      "─".repeat(8),
    ].join(" "),
  );

  console.log();
  console.log("  " + header);
  console.log("  " + divider);
  for (const r of rows) {
    const amountStr = r.amount != null ? `$${r.amount.toFixed(2)}` : "—";
    const line = [
      pc.cyan(pad(r.trace_id, 28)),
      pad(formatTimestamp(r._creationTime), 17),
      pc.dim(pad(r.agent_id ?? "—", 26)),
      pad(r.domain ?? "—", 18),
      pc.dim(pad(r.standard ?? "—", 5)),
      pad(amountStr, 9),
      decisionBadge(r.decision),
      outcomeBadge(r.outcome),
    ].join(" ");
    console.log("  " + line);
  }
  console.log();
  console.log(pc.dim(`  ${rows.length} row${rows.length === 1 ? "" : "s"}.`));
  console.log(
    pc.dim(`  next: ${pc.cyan("rhemify traces show <trace_id>")} · ${pc.cyan("rhemify traces replay <trace_id> --override key=value")}`),
  );
  console.log();
}

export async function tracesList(argv: string[] = []): Promise<void> {
  let args: ListArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(pc.red(`error: ${(err as Error).message}\n`));
    printHelp();
    process.exit(2);
  }

  const url = resolveConvexUrl(args.convexUrl);
  const client = new ConvexHttpClient(url);

  let rows: TraceRow[];
  try {
    // Untyped query reference — we don't import the workspace's generated
    // Convex api here, both to avoid the cross-package coupling and because
    // the CLI may run against a deployment whose schema lives in a different
    // build. The cast pattern matches packages/backend/scripts/enum-validation-test.ts
    // and apps/tui/scripts/seed.ts.
    const queryArgs = {
      limit: args.limit,
      agent_id: args.agentId,
      blocked_only: args.blockedOnly,
    } as never;
    rows = (await client.query("traces:listAll" as never, queryArgs)) as TraceRow[];
  } catch (err) {
    console.error(pc.red(`\n  Failed to query Convex at ${url}`));
    console.error(pc.red(`  ${(err as Error).message}\n`));
    console.error(pc.dim("  Is `bunx convex dev` running in packages/backend/?"));
    console.error(pc.dim("  Override the URL with --convex <url> or CONVEX_URL env var.\n"));
    process.exit(1);
  }

  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  renderTable(rows);
}
