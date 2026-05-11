/**
 * `rhemify traces show <trace_id> [--json] [--convex <url>]`
 *
 * Full decision context for a single trace — the "why did this payment
 * decision happen" view a CFO opens after `traces list`. Seven sections,
 * top-to-bottom, ordered by decreasing weight for the audit question:
 *
 *   TRACE          identity banner + allowed/blocked badge
 *   EVENT          what happened (agent, vendor, amount, outcome)
 *   POLICY         the 6 rules fired with thresholds (the WHY)
 *   PATH           selected instrument + alternatives evaluated
 *   SNAPSHOT       captured policy + vendor + agent state at decision time
 *   VERIFIABILITY  trace_hash + anchor status (Solana tx if anchored)
 *   NEXT           pre-filled replay command
 *
 * Pattern: `gh pr view` style multi-section render. Reads top-to-bottom.
 */

import { ConvexHttpClient } from "convex/browser";
import pc from "picocolors";
import { resolveConvexUrl } from "../../config.js";

interface PolicyRule {
  rule: string;
  result: "pass" | "block" | "flag" | "skipped";
  threshold: string;
  value: string;
}

interface Alternative {
  instrument: string;
  available: boolean;
  reason?: string;
  score?: number;
  estimated_cost?: number;
}

interface PaymentEvent {
  agent_id: string;
  fleet_id: string;
  amount: number;
  domain: string;
  standard: string;
  outcome: string;
  token: string;
  chain: string;
}

interface TraceWithEvent {
  _id: string;
  _creationTime: number;
  trace_id: string;
  agent_task_context: string;
  trigger_402_raw: string;
  alternatives_evaluated: Alternative[];
  policy_rules_fired: PolicyRule[];
  instrument_selection_log: { selected: string; reason: string };
  confidence: "high" | "medium" | "low";
  replay_snapshot: {
    policy_state: {
      daily_limit?: number;
      max_per_transaction?: number;
      domain_allowlist?: string[];
      allowed_standards?: string[];
      approval_threshold?: number;
    };
    vendor_registry_snapshot: Record<string, { is_blocked: boolean }>;
    agent_context: { spend_today?: number };
  };
  trace_hash: string;
  anchor_tx_hash?: string | null;
  payment_event: PaymentEvent | null;
}

interface ShowArgs {
  traceId?: string;
  json?: boolean;
  convexUrl?: string;
}

function parseArgs(argv: string[]): ShowArgs {
  const out: ShowArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      out.json = true;
    } else if (arg === "--convex") {
      const v = argv[++i];
      if (!v) throw new Error("--convex requires a URL");
      out.convexUrl = v;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg && !arg.startsWith("--") && !out.traceId) {
      out.traceId = arg;
    } else if (arg !== undefined) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out.traceId) throw new Error("Missing required argument: <trace_id>");
  return out;
}

function printHelp(): void {
  console.log(`
${pc.bold("rhemify traces show")} — show full decision context for a single trace

${pc.bold("Usage:")}
  rhemify traces show <trace_id> [options]

${pc.bold("Options:")}
  --json            output raw trace document instead of pretty render
  --convex <url>    override Convex deployment URL
  -h, --help        show this message

${pc.bold("Example:")}
  rhemify traces show trc_seed_1778482712054_8
`);
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function ruleIcon(result: PolicyRule["result"]): string {
  if (result === "pass") return pc.green("✓");
  if (result === "block") return pc.red("✗");
  if (result === "flag") return pc.yellow("!");
  return pc.dim("·");
}

function section(title: string): void {
  console.log(pc.bold(pc.cyan(`\n${title}`)));
}

function row(label: string, value: string): void {
  console.log(`  ${pc.dim(label.padEnd(20))} ${value}`);
}

function render(t: TraceWithEvent): void {
  const blocked = t.policy_rules_fired.some((r) => r.result === "block");
  const badge = blocked ? pc.red(pc.bold(" BLOCKED ")) : pc.green(pc.bold(" ALLOWED "));

  // TRACE
  section("TRACE");
  row("trace_id", pc.cyan(t.trace_id));
  row("decision", badge);
  row("at", formatTimestamp(t._creationTime));
  row("confidence", t.confidence);

  // EVENT
  section("EVENT");
  if (t.payment_event) {
    row("agent", pc.dim(t.payment_event.agent_id));
    row("fleet", pc.dim(t.payment_event.fleet_id));
    row("vendor", t.payment_event.domain);
    row("amount", `${pc.yellow(`$${t.payment_event.amount.toFixed(4)}`)} ${t.payment_event.token} on ${pc.dim(t.payment_event.chain)}`);
    row("standard", t.payment_event.standard);
    row("outcome", outcomeColor(t.payment_event.outcome));
    if (t.agent_task_context) row("agent context", pc.dim(t.agent_task_context));
    if (t.trigger_402_raw) row("trigger 402", pc.dim(t.trigger_402_raw));
  } else {
    row("status", pc.red("payment_event missing — trace orphaned"));
  }

  // POLICY
  section(`POLICY  ${pc.dim(`${t.policy_rules_fired.length} rules evaluated`)}`);
  const maxRuleLen = Math.max(...t.policy_rules_fired.map((r) => r.rule.length), 22);
  for (const r of t.policy_rules_fired) {
    const result = r.result === "block" ? pc.red(r.result.toUpperCase()) :
                   r.result === "flag" ? pc.yellow(r.result.toUpperCase()) :
                   r.result === "skipped" ? pc.dim(r.result) :
                   pc.green(r.result);
    const detail = `${pc.dim("threshold")} ${r.threshold}  ${pc.dim("actual")} ${r.value}`;
    console.log(`  ${ruleIcon(r.result)} ${r.rule.padEnd(maxRuleLen)}  ${result.padEnd(20)}  ${detail}`);
  }

  // PATH
  section("PATH SELECTION");
  if (t.instrument_selection_log) {
    row("selected", t.instrument_selection_log.selected === "none" ? pc.red("none") : pc.green(t.instrument_selection_log.selected));
    row("reason", t.instrument_selection_log.reason);
  }
  if (Array.isArray(t.alternatives_evaluated) && t.alternatives_evaluated.length > 0) {
    console.log(`  ${pc.dim("alternatives".padEnd(20))}`);
    for (const a of t.alternatives_evaluated) {
      const status = a.available ? pc.green("avail") : pc.dim("unavail");
      const meta = a.available
        ? `score ${a.score?.toFixed(2) ?? "?"}${a.estimated_cost != null ? `, est $${a.estimated_cost.toFixed(4)}` : ""}`
        : a.reason ?? "";
      console.log(`      • ${a.instrument.padEnd(10)} ${status}  ${pc.dim(meta)}`);
    }
  }

  // SNAPSHOT
  section(`SNAPSHOT  ${pc.dim("captured state at decision time")}`);
  const ps = t.replay_snapshot.policy_state;
  const psParts: string[] = [];
  if (ps.daily_limit != null) psParts.push(`daily_limit=${ps.daily_limit}`);
  if (ps.max_per_transaction != null) psParts.push(`max_per_tx=${ps.max_per_transaction}`);
  if (ps.approval_threshold != null) psParts.push(`approval=${ps.approval_threshold}`);
  if (ps.domain_allowlist) psParts.push(`allowlist=${ps.domain_allowlist.length} domain${ps.domain_allowlist.length === 1 ? "" : "s"}`);
  if (ps.allowed_standards) psParts.push(`standards=[${ps.allowed_standards.join(",")}]`);
  row("policy", psParts.join("  "));
  const vendorCount = Object.keys(t.replay_snapshot.vendor_registry_snapshot ?? {}).length;
  row("vendors", `${vendorCount} in registry`);
  row("agent ctx", `spend_today=$${(t.replay_snapshot.agent_context.spend_today ?? 0).toFixed(2)}`);

  // VERIFIABILITY
  section("VERIFIABILITY");
  row("trace hash", pc.dim(t.trace_hash));
  if (t.anchor_tx_hash) {
    row("anchor tx", pc.green(t.anchor_tx_hash));
    row("explorer", pc.dim(`https://explorer.solana.com/tx/${t.anchor_tx_hash}?cluster=devnet`));
  } else {
    row("anchor status", pc.dim("not anchored yet (Phase N.4 verify cmd will anchor + verify)"));
  }

  // NEXT
  section("NEXT");
  console.log(pc.dim(`  Try a counterfactual:`));
  console.log(`    ${pc.cyan(`rhemify traces replay ${t.trace_id} --override daily_limit=1`)}`);
  console.log(`    ${pc.cyan(`rhemify traces replay ${t.trace_id} --override 'domain_allowlist=-${t.payment_event?.domain ?? "<domain>"}'`)}`);
  console.log();
}

function outcomeColor(outcome: string): string {
  if (outcome === "success") return pc.green(outcome);
  if (outcome === "rejected") return pc.red(outcome);
  if (outcome === "failed") return pc.yellow(outcome);
  return pc.dim(outcome);
}

export async function tracesShow(argv: string[] = []): Promise<void> {
  let args: ShowArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(pc.red(`error: ${(err as Error).message}\n`));
    printHelp();
    process.exit(2);
  }

  const url = resolveConvexUrl(args.convexUrl);
  const client = new ConvexHttpClient(url);

  let trace: TraceWithEvent | null;
  try {
    trace = (await client.query("traces:getByTraceId" as never, {
      trace_id: args.traceId,
    } as never)) as TraceWithEvent | null;
  } catch (err) {
    console.error(pc.red(`\n  Failed to query Convex at ${url}`));
    console.error(pc.red(`  ${(err as Error).message}\n`));
    console.error(pc.dim("  Is `bunx convex dev` running in packages/backend/?\n"));
    process.exit(1);
  }

  if (!trace) {
    console.error(pc.red(`\n  No trace found with trace_id: ${args.traceId}\n`));
    console.error(pc.dim("  Browse available traces: rhemify traces list\n"));
    process.exit(1);
  }

  if (args.json) {
    console.log(JSON.stringify(trace, null, 2));
    return;
  }

  render(trace);
}
