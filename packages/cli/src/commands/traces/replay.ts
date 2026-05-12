/**
 * `rhemify traces replay <trace_id> [overrides] [--json]`
 *
 * THE killer demo. Sends a trace_id + policy overrides to the Go server's
 * /api/traces/:id/replay endpoint, which re-evaluates the 6 policy rules
 * against the captured replay_snapshot under the new policy and returns
 * an original-vs-counterfactual diff.
 *
 * Override flag design — hybrid of Tenderly's `--override key=value`
 * generic pattern and per-rule named flags for the common case:
 *
 *   --daily-limit N          scalar replace
 *   --max-per-tx N           scalar replace
 *   --approval-threshold N   scalar replace
 *   --add-domain D           array add  (repeatable)
 *   --remove-domain D        array remove (sent as ["-D"]) (repeatable)
 *   --add-standard S         array add  (repeatable)
 *   --remove-standard S      array remove (repeatable)
 *   --override KEY=VALUE     generic escape hatch (repeatable, takes priority)
 *
 * Each flag transforms into the policy_overrides map the Go engine's
 * replay.ApplyOverrides already understands (scalar = replace,
 * array = add (no prefix) / remove ("-" prefix)).
 *
 * Auth — the /replay endpoint is in the FleetAPIKeyAuth middleware group.
 * The CLI loads the api_key from (priority order):
 *   1. --api-key flag
 *   2. RHEMIFY_FLEET_API_KEY env var
 *   3. ~/.rhemify/config.json
 *   4. Looks up the seed demo fleet's api_key from Convex (local dev fallback)
 */

import { ConvexHttpClient } from "convex/browser";
import pc from "picocolors";
import { loadConfig, resolveConvexUrl } from "../../config.js";

interface RuleResult {
  rule: string;
  result: "pass" | "block" | "flag" | "skipped";
  threshold: string;
  actual: string;
}

interface PolicyOutcome {
  allowed: boolean;
  rule_results: RuleResult[];
}

interface PolicyDiff {
  rule: string;
  original_result: string;
  replayed_result: string;
  changed: boolean;
}

interface ReplayResult {
  trace_id: string;
  snapshot_complete: boolean;
  original: PolicyOutcome;
  replayed: PolicyOutcome;
  // Go serializes an empty []PolicyDiff slice as JSON null (not []), so
  // every consumer must defensively treat null as the no-changes case.
  diff: PolicyDiff[] | null;
  counterfactual_blocked: boolean;
}

interface ReplayArgs {
  traceId?: string;
  serverUrl?: string;
  convexUrl?: string;
  apiKey?: string;
  json?: boolean;
  overrides: Record<string, unknown>;
  // Track presence so we know whether to merge array adds/removes:
  domainArr: string[];
  standardArr: string[];
}

const DEFAULT_SERVER_URL = "http://localhost:8080";

function parseScalarMaybeNumber(raw: string): string | number {
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function parseOverrideKV(arg: string): [string, unknown] {
  const eq = arg.indexOf("=");
  if (eq <= 0) throw new Error(`--override must be KEY=VALUE, got: ${arg}`);
  const key = arg.slice(0, eq);
  const rawVal = arg.slice(eq + 1);
  // Comma → array; otherwise scalar
  if (rawVal.includes(",")) {
    return [key, rawVal.split(",").map((s) => s.trim()).map(parseScalarMaybeNumber)];
  }
  return [key, parseScalarMaybeNumber(rawVal)];
}

function parseArgs(argv: string[]): ReplayArgs {
  const out: ReplayArgs = {
    overrides: {},
    domainArr: [],
    standardArr: [],
  };

  const requireValue = (flag: string, i: number): string => {
    const v = argv[i];
    if (v === undefined) throw new Error(`${flag} requires a value`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--daily-limit": {
        const v = Number(requireValue(arg, ++i));
        if (!Number.isFinite(v)) throw new Error("--daily-limit must be a number");
        out.overrides.daily_limit = v;
        break;
      }
      case "--max-per-tx": {
        const v = Number(requireValue(arg, ++i));
        if (!Number.isFinite(v)) throw new Error("--max-per-tx must be a number");
        out.overrides.max_per_transaction = v;
        break;
      }
      case "--approval-threshold": {
        const v = Number(requireValue(arg, ++i));
        if (!Number.isFinite(v)) throw new Error("--approval-threshold must be a number");
        out.overrides.approval_threshold = v;
        break;
      }
      case "--add-domain":
        out.domainArr.push(requireValue(arg, ++i));
        break;
      case "--remove-domain":
        out.domainArr.push(`-${requireValue(arg, ++i)}`);
        break;
      case "--add-standard":
        out.standardArr.push(requireValue(arg, ++i));
        break;
      case "--remove-standard":
        out.standardArr.push(`-${requireValue(arg, ++i)}`);
        break;
      case "--override": {
        const [k, v] = parseOverrideKV(requireValue(arg, ++i));
        out.overrides[k] = v;
        break;
      }
      case "--server": {
        out.serverUrl = requireValue(arg, ++i);
        break;
      }
      case "--convex": {
        out.convexUrl = requireValue(arg, ++i);
        break;
      }
      case "--api-key": {
        out.apiKey = requireValue(arg, ++i);
        break;
      }
      case "--json":
        out.json = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        if (arg && !arg.startsWith("--") && !out.traceId) {
          out.traceId = arg;
        } else {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  if (!out.traceId) throw new Error("Missing required argument: <trace_id>");

  // Fold array buckets into overrides
  if (out.domainArr.length > 0) out.overrides.domain_allowlist = out.domainArr;
  if (out.standardArr.length > 0) out.overrides.allowed_standards = out.standardArr;

  return out;
}

function printHelp(): void {
  console.log(`
${pc.bold("rhemify traces replay")} — re-evaluate a payment decision under different policy

${pc.bold("Usage:")}
  rhemify traces replay <trace_id> [overrides] [options]

${pc.bold("Scalar overrides:")}
  --daily-limit <N>           set fleet daily spend cap
  --max-per-tx <N>            set per-transaction cap
  --approval-threshold <N>    set "flag for review" threshold

${pc.bold("Array overrides (repeatable):")}
  --add-domain <D>            add D to domain allowlist
  --remove-domain <D>         remove D from domain allowlist
  --add-standard <S>          add S (x402|mpp|l402|ap2) to allowed standards
  --remove-standard <S>       remove S from allowed standards

${pc.bold("Generic (escape hatch):")}
  --override KEY=VALUE        override any policy_state field. comma → array.
                              e.g. --override 'daily_limit=10'
                                   --override 'domain_allowlist=-bad.com'

${pc.bold("Connection:")}
  --server <url>              Go server URL (default ${DEFAULT_SERVER_URL})
  --convex <url>              Convex URL (for api_key lookup fallback)
  --api-key <key>             fleet API key (else env / config / Convex lookup)
  --json                      raw JSON output for jq piping
  -h, --help                  show this message

${pc.bold("Examples:")}
  rhemify traces replay trc_seed_..._8 --add-domain perplexity.ai
  rhemify traces replay trc_seed_..._0 --daily-limit 0.10
  rhemify traces replay trc_xyz --override 'domain_allowlist=foo.com,-bar.com'
`);
}

async function resolveApiKey(args: ReplayArgs): Promise<string> {
  if (args.apiKey) return args.apiKey;
  if (process.env.RHEMIFY_FLEET_API_KEY) return process.env.RHEMIFY_FLEET_API_KEY;

  const cfg = loadConfig();
  if (cfg?.fleetId) {
    // Look up the api_key via Convex (using whatever convex URL config knows about)
    try {
      const url = resolveConvexUrl(args.convexUrl);
      const client = new ConvexHttpClient(url);
      const fleet = (await client.query("fleets:get" as never, {
        id: cfg.fleetId,
      } as never)) as { api_key?: string } | null;
      if (fleet?.api_key) return fleet.api_key;
    } catch {
      // fall through to demo-fleet fallback
    }
  }

  // Local-dev fallback: look up the demo fleet by its well-known email.
  // Seed mutation guarantees this fleet has api_key set.
  const url = resolveConvexUrl(args.convexUrl);
  const client = new ConvexHttpClient(url);
  const demo = (await client.query("fleets:getByEmail" as never, {
    email: "demo@rhemify.local",
  } as never)) as { api_key?: string } | null;
  if (demo?.api_key) return demo.api_key;

  throw new Error(
    "No fleet API key found. Set RHEMIFY_FLEET_API_KEY, run `rhemify onboard`, " +
      "or seed the demo fleet (cd apps/tui && bun run seed --reseed).",
  );
}

function ruleIcon(result: RuleResult["result"]): string {
  if (result === "pass") return pc.green("✓");
  if (result === "block") return pc.red("✗");
  if (result === "flag") return pc.yellow("!");
  return pc.dim("·");
}

function colorResult(result: string): string {
  if (result === "block") return pc.red(result.toUpperCase());
  if (result === "pass") return pc.green(result);
  if (result === "flag") return pc.yellow(result);
  return pc.dim(result);
}

/**
 * Pad a colorized string to a visible width. `String.padEnd` counts
 * ANSI escape codes as visible chars, so colorized cells end up
 * over-padded by ~5–10 chars depending on the color. We compute the
 * uncolored visible length here, then add the padding outside the
 * color codes.
 */
function colorPadEnd(colored: string, visible: string, width: number): string {
  const pad = Math.max(0, width - visible.length);
  return colored + " ".repeat(pad);
}

function render(args: ReplayArgs, r: ReplayResult): void {
  const orig = r.original.allowed ? pc.green(pc.bold(" ALLOWED ")) : pc.red(pc.bold(" BLOCKED "));
  const counter = r.counterfactual_blocked
    ? pc.red(pc.bold(" BLOCKED "))
    : pc.green(pc.bold(" ALLOWED "));

  const verdict = r.original.allowed === !r.counterfactual_blocked
    ? pc.dim("(decision unchanged)")
    : r.counterfactual_blocked
      ? pc.red(pc.bold("← would now be BLOCKED"))
      : pc.green(pc.bold("← would now be ALLOWED"));

  // Header
  console.log(`\n${pc.bold(pc.cyan("REPLAY"))} ${pc.dim(r.trace_id)}`);

  // Overrides applied
  console.log(pc.bold(pc.cyan("\nOVERRIDES APPLIED")));
  if (Object.keys(args.overrides).length === 0) {
    console.log(pc.dim("  (none — re-running with original policy as a sanity check)"));
  } else {
    for (const [k, v] of Object.entries(args.overrides)) {
      const valStr = Array.isArray(v) ? `[${v.join(", ")}]` : String(v);
      console.log(`  ${pc.yellow(k.padEnd(22))} ${pc.bold(valStr)}`);
    }
  }

  // Verdict
  console.log(pc.bold(pc.cyan("\nVERDICT")));
  console.log(`  ${pc.dim("original:".padEnd(14))} ${orig}`);
  console.log(`  ${pc.dim("counterfactual:".padEnd(14))} ${counter} ${verdict}`);

  // Per-rule diff table
  console.log(pc.bold(pc.cyan("\nRULE-BY-RULE")));
  console.log(
    "  " + pc.dim("rule".padEnd(22)) + " " + pc.dim("original".padEnd(10)) + " " + pc.dim("→ replayed".padEnd(14)) + " " + pc.dim("changed"),
  );
  console.log(
    "  " + pc.dim("─".repeat(21)) + " " + pc.dim("─".repeat(9)) + " " + pc.dim("─".repeat(13)) + " " + pc.dim("─".repeat(7)),
  );

  // Combine original+replayed rule lists by rule name. Go marshals an
  // empty diff slice as null — coalesce so .map doesn't throw.
  const diff = r.diff ?? [];
  const origMap = new Map(r.original.rule_results.map((x) => [x.rule, x]));
  const repMap = new Map(r.replayed.rule_results.map((x) => [x.rule, x]));
  const allRules = Array.from(new Set([...origMap.keys(), ...repMap.keys()]));
  const diffRules = new Set(diff.map((d) => d.rule));

  for (const ruleName of allRules) {
    const o = origMap.get(ruleName);
    const re = repMap.get(ruleName);
    const oVisible = o ? o.result.toUpperCase().match(/^(BLOCK)$/) ? "BLOCK" : o.result : "skipped";
    const rVisible = re ? re.result.toUpperCase().match(/^(BLOCK)$/) ? "BLOCK" : re.result : "skipped";
    const oResult = o ? colorResult(o.result) : pc.dim("skipped");
    const rResult = re ? colorResult(re.result) : pc.dim("skipped");
    const changed = diffRules.has(ruleName) ? pc.yellow("CHANGED") : pc.dim("—");
    const icon = re ? ruleIcon(re.result) : ruleIcon("skipped");
    console.log(
      `  ${icon} ${ruleName.padEnd(20)} ${colorPadEnd(oResult, oVisible, 10)} → ${colorPadEnd(rResult, rVisible, 10)} ${changed}`,
    );
  }

  // What's actually different
  console.log(pc.bold(pc.cyan("\nDIFF SUMMARY")));
  if (diff.length === 0) {
    console.log(pc.dim("  No rules changed outcome — your override didn't affect the decision."));
  } else {
    for (const d of diff) {
      console.log(
        `  ${pc.yellow(d.rule.padEnd(22))} ${colorResult(d.original_result)} → ${colorResult(d.replayed_result)}`,
      );
    }
  }

  console.log();
}

export async function tracesReplay(argv: string[] = []): Promise<void> {
  let args: ReplayArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(pc.red(`error: ${(err as Error).message}\n`));
    printHelp();
    process.exit(2);
  }

  const serverUrl = (args.serverUrl ?? loadConfig()?.serverUrl ?? DEFAULT_SERVER_URL).replace(/\/$/, "");

  let apiKey: string;
  try {
    apiKey = await resolveApiKey(args);
  } catch (err) {
    console.error(pc.red(`\n  ${(err as Error).message}\n`));
    process.exit(1);
  }

  let resp: Response;
  try {
    resp = await fetch(`${serverUrl}/api/traces/${encodeURIComponent(args.traceId!)}/replay`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ policy_overrides: args.overrides }),
    });
  } catch (err) {
    console.error(pc.red(`\n  Failed to reach Go server at ${serverUrl}`));
    console.error(pc.red(`  ${(err as Error).message}\n`));
    console.error(pc.dim("  Start it: cd apps/server && CONVEX_URL=<url> go run ./cmd/server\n"));
    process.exit(1);
  }

  if (!resp.ok) {
    const body = await resp.text();
    console.error(pc.red(`\n  HTTP ${resp.status} from ${serverUrl}`));
    console.error(pc.red(`  ${body}\n`));
    process.exit(1);
  }

  const result = (await resp.json()) as ReplayResult;

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  render(args, result);
}
