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

/**
 * Policy rule shape — accepts either the seeded shape (`result`/`value`) or
 * the SDK-emitted shape (`decision`/`actual`). The Go server's reshape doesn't
 * normalize this so we have to absorb the drift at render time. Convert via
 * normalizeRule() before rendering.
 */
interface PolicyRule {
  rule: string;
  result?: "pass" | "block" | "flag" | "skipped";
  decision?: "allow" | "block" | "flag" | "pass" | "skipped";
  threshold: string;
  value?: string;
  actual?: string;
}

interface NormalizedRule {
  rule: string;
  result: "pass" | "block" | "flag" | "skipped";
  threshold: string;
  value: string;
}

function normalizeRule(r: PolicyRule): NormalizedRule {
  // SDK emits `decision: "allow"` for pass; seed used `result: "pass"`.
  let result: NormalizedRule["result"] = "pass";
  const raw = r.result ?? r.decision ?? "pass";
  if (raw === "block") result = "block";
  else if (raw === "flag") result = "flag";
  else if (raw === "skipped") result = "skipped";
  // "allow" / "pass" / anything else → "pass"
  return {
    rule: r.rule,
    result,
    threshold: r.threshold ?? "",
    value: r.value ?? r.actual ?? "",
  };
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
  // Seeded as { selected, reason }; SDK emits a plain string. Render both.
  instrument_selection_log: { selected: string; reason: string } | string;
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
  payment_tx_hash?: string | null;
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
  const rules = (t.policy_rules_fired ?? []).map(normalizeRule);
  section(`POLICY  ${pc.dim(`${rules.length} rules evaluated`)}`);
  const maxRuleLen = Math.max(...rules.map((r) => r.rule.length), 22);
  for (const r of rules) {
    // Compute the rendered (colored) string AND the visible-length string
    // separately. `String.padEnd(n)` counts ANSI escape codes, so padding
    // the colored string would inflate the column by ~6–10 chars per row.
    const visible =
      r.result === "block" || r.result === "flag" ? r.result.toUpperCase() : r.result;
    const result =
      r.result === "block" ? pc.red(visible) :
      r.result === "flag" ? pc.yellow(visible) :
      r.result === "skipped" ? pc.dim(visible) :
      pc.green(visible);
    const pad = " ".repeat(Math.max(0, 10 - visible.length));
    const detail = `${pc.dim("threshold")} ${r.threshold}  ${pc.dim("actual")} ${r.value}`;
    console.log(`  ${ruleIcon(r.result)} ${r.rule.padEnd(maxRuleLen)}  ${result}${pad}  ${detail}`);
  }

  // PATH
  section("PATH SELECTION");
  const isl = t.instrument_selection_log;
  if (typeof isl === "string" && isl) {
    row("log", isl);
  } else if (isl && typeof isl === "object") {
    row("selected", isl.selected === "none" ? pc.red("none") : pc.green(isl.selected));
    row("reason", isl.reason);
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
  const snap = t.replay_snapshot ?? {};
  // SDK emits camelCase keys (dailyLimit, maxPerTransaction, ...) and zero
  // values when policy isn't fully wired; seed.ts used snake_case with real
  // values. Read both — prefer real (non-zero) value if available.
  const psRaw = (snap.policy_state ?? {}) as Record<string, unknown>;
  const num = (a: unknown, b: unknown): number | undefined => {
    const v = (typeof a === "number" && a > 0 ? a : undefined) ??
              (typeof b === "number" && b > 0 ? b : undefined) ??
              (typeof a === "number" ? a : undefined) ??
              (typeof b === "number" ? b : undefined);
    return v;
  };
  const arr = (a: unknown, b: unknown): string[] | undefined => {
    if (Array.isArray(a) && a.length > 0) return a as string[];
    if (Array.isArray(b) && b.length > 0) return b as string[];
    if (Array.isArray(a)) return a as string[];
    if (Array.isArray(b)) return b as string[];
    return undefined;
  };
  const dailyLimit = num(psRaw.daily_limit, psRaw.dailyLimit);
  const maxPerTx = num(psRaw.max_per_transaction, psRaw.maxPerTransaction);
  const approval = num(psRaw.approval_threshold, psRaw.approvalThreshold);
  const allowlist = arr(psRaw.domain_allowlist, psRaw.domainAllowlist);
  const standards = arr(psRaw.allowed_standards, psRaw.allowedStandards);
  const psParts: string[] = [];
  if (dailyLimit !== undefined) psParts.push(`daily_limit=${dailyLimit}`);
  if (maxPerTx !== undefined) psParts.push(`max_per_tx=${maxPerTx}`);
  if (approval !== undefined) psParts.push(`approval=${approval}`);
  if (allowlist) psParts.push(`allowlist=${allowlist.length} domain${allowlist.length === 1 ? "" : "s"}`);
  if (standards) psParts.push(`standards=[${standards.join(",")}]`);
  row("policy", psParts.length > 0 ? psParts.join("  ") : pc.dim("(empty — SDK policy state not yet populated)"));
  const vendorCount = Object.keys(snap.vendor_registry_snapshot ?? {}).length;
  row("vendors", `${vendorCount} in registry`);
  const agentCtx = snap.agent_context ?? {};
  const spendToday = (agentCtx as { spend_today?: number }).spend_today ?? 0;
  row("agent ctx", `spend_today=$${spendToday.toFixed(2)}`);

  // VERIFIABILITY
  section("VERIFIABILITY");
  row("trace hash", pc.dim(t.trace_hash));
  if (t.payment_tx_hash) {
    row("payment tx", pc.green(t.payment_tx_hash));
    row("payment explorer", pc.dim(`https://explorer.solana.com/tx/${t.payment_tx_hash}?cluster=devnet`));
  } else {
    row("payment tx", pc.dim("none (dry-run or executor produced no signature)"));
  }
  if (t.anchor_tx_hash) {
    row("anchor tx", pc.green(t.anchor_tx_hash));
    row("anchor explorer", pc.dim(`https://explorer.solana.com/tx/${t.anchor_tx_hash}?cluster=devnet`));
  } else {
    row("anchor status", pc.dim("not anchored yet (rhemify traces verify <id> anchors it)"));
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
