/**
 * `rhemify traces verify <trace_id> [--json]`
 *
 * THE moat command. Anchors a trace's hash on Solana devnet via the
 * rhemify-anchor program's write_daily_root instruction, then reads the
 * PDA back to prove the trace is cryptographically committed on-chain.
 *
 * Flow:
 *   1. Load trace from Convex
 *   2. Compute leaf bytes = sha256(trace.trace_hash) — deterministic 32 bytes
 *   3. For single-trace verify, merkle_root = leaf (single-leaf tree).
 *      Production batches multiple traces; this CLI demonstrates the
 *      anchor primitive for one trace at a time. See Phase N.4 design
 *      note in docs/superpowers/specs/2026-04-15-replay-engine-design.md.
 *   4. Derive PDA: [b"rhemify-daily", authority, fleet_id, date]
 *      (user-scoped seeds per Phase C — same as tools/devnet-smoke/
 *      squat-defeated.ts proved structurally squat-resistant).
 *   5. Check if PDA already exists on devnet. If yes, READ the on-chain
 *      root and compare to our computed root → VERIFIED if match.
 *      If no, build write_daily_root tx, submit, then re-query.
 *   6. Print VERIFIED with pda + tx_hash + slot + explorer link.
 *
 * Auth: uses ~/.config/solana/id.json (the user's local devnet keypair).
 * No Go server needed — this command talks directly to Solana devnet.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { ConvexHttpClient } from "convex/browser";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import { resolveConvexUrl } from "../../config.js";

const RHEMIFY_ANCHOR_PROGRAM_ID = new PublicKey(
  "HYWjBbLMEz98KnppVkUnHmkUZ4pyQ8abaDRTtUedUkxV",
);
const DEVNET_RPC = "https://api.devnet.solana.com";

interface VerifyArgs {
  traceId?: string;
  convexUrl?: string;
  json?: boolean;
  rpcUrl?: string;
}

interface TraceRow {
  trace_id: string;
  trace_hash: string;
  _creationTime: number;
  payment_event_id: string;
}

interface PaymentEventRow {
  fleet_id: string;
  agent_id: string;
  domain: string;
  amount: number;
}

interface VerifyResult {
  trace_id: string;
  computed_root: string;
  pda: string;
  pda_bump: number;
  on_chain_root: string;
  match: boolean;
  fleet_id: string;
  date: string;
  tx_hash: string | null;
  slot: number | null;
  newly_anchored: boolean;
  explorer: {
    tx: string | null;
    pda: string;
  };
}

function parseArgs(argv: string[]): VerifyArgs {
  const out: VerifyArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      out.json = true;
    } else if (arg === "--convex") {
      const v = argv[++i];
      if (!v) throw new Error("--convex requires a URL");
      out.convexUrl = v;
    } else if (arg === "--rpc") {
      const v = argv[++i];
      if (!v) throw new Error("--rpc requires a URL");
      out.rpcUrl = v;
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
${pc.bold("rhemify traces verify")} — cryptographically prove a trace exists on Solana

${pc.bold("Usage:")}
  rhemify traces verify <trace_id> [options]

${pc.bold("Options:")}
  --json            raw JSON output for scripting
  --convex <url>    override Convex deployment URL
  --rpc <url>       override Solana RPC URL (default ${DEVNET_RPC})
  -h, --help        show this message

${pc.bold("What this does:")}
  1. Loads the trace from Convex
  2. Computes leaf = sha256(trace_hash) — deterministic 32 bytes
  3. Derives the daily-root PDA from the deployed rhemify-anchor program
  4. If PDA exists: reads on-chain root, verifies match (no tx submitted)
     If not:       submits write_daily_root, waits, re-queries PDA
  5. Prints VERIFIED with on-chain receipt — explorer link, slot, tx hash

${pc.bold("Requires:")}
  - ~/.config/solana/id.json (your devnet keypair, ~0.001 SOL per new anchor)
  - bunx convex dev running in packages/backend/ (for Convex query)

${pc.bold("Example:")}
  rhemify traces verify trc_seed_1778482712054_0
`);
}

function loadKeypair(): Keypair {
  const path = join(homedir(), ".config", "solana", "id.json");
  const secret = new Uint8Array(JSON.parse(readFileSync(path, "utf-8")));
  return Keypair.fromSecretKey(secret);
}

function dateForTrace(creationTimeMs: number): string {
  // YYYY-MM-DD UTC — matches the Anchor program's expected seed format
  return new Date(creationTimeMs).toISOString().slice(0, 10);
}

function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function encodeBorshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function encodeU32LE(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

/** Read on-chain DailyRoot.merkle_root from a fetched account's raw data. */
function parseOnChainRoot(data: Buffer, fleetId: string, date: string): Buffer | null {
  // DailyRoot layout (Anchor): 8-byte discriminator, then InitSpace ordering:
  //   fleet_id: String         (4 bytes len + max 32 bytes utf8)
  //   date: String             (4 bytes len + max 10 bytes utf8)
  //   merkle_root: [u8; 32]    (32 bytes, no length prefix — fixed)
  //   trace_count: u32         (4 bytes)
  //   authority: Pubkey        (32 bytes)
  //   timestamp: i64           (8 bytes)
  //   bump: u8                 (1 byte)
  //
  // Strings are stored variable-length (4-byte LE length, then utf8) — NOT
  // padded to max_len in serialized form. So we walk the buffer.
  let offset = 8; // discriminator

  const fleetIdLen = data.readUInt32LE(offset);
  offset += 4;
  const fleetIdStr = data.subarray(offset, offset + fleetIdLen).toString("utf-8");
  offset += fleetIdLen;
  if (fleetIdStr !== fleetId) return null;

  const dateLen = data.readUInt32LE(offset);
  offset += 4;
  const dateStr = data.subarray(offset, offset + dateLen).toString("utf-8");
  offset += dateLen;
  if (dateStr !== date) return null;

  const merkleRoot = data.subarray(offset, offset + 32);
  return Buffer.from(merkleRoot);
}

async function loadTrace(convexUrl: string, traceId: string): Promise<{ trace: TraceRow; event: PaymentEventRow }> {
  const client = new ConvexHttpClient(convexUrl);
  const result = (await client.query("traces:getByTraceId" as never, {
    trace_id: traceId,
  } as never)) as (TraceRow & { payment_event: PaymentEventRow | null }) | null;
  if (!result) throw new Error(`Trace not found: ${traceId}`);
  if (!result.payment_event) throw new Error(`Trace ${traceId} has no linked payment_event`);
  return { trace: result, event: result.payment_event };
}

function row(label: string, value: string): void {
  console.log(`  ${pc.dim(label.padEnd(18))} ${value}`);
}

function section(title: string): void {
  console.log(pc.bold(pc.cyan(`\n${title}`)));
}

function render(_args: VerifyArgs, r: VerifyResult): void {
  const badge = r.match ? pc.green(pc.bold(" VERIFIED ")) : pc.red(pc.bold(" MISMATCH "));

  console.log(`\n${pc.bold(pc.cyan("VERIFY"))} ${pc.dim(r.trace_id)}`);
  console.log(`  ${badge}  ${r.match ? pc.green("trace hash matches on-chain Merkle root") : pc.red("on-chain root does not match computed root")}`);

  section("ON-CHAIN");
  row("program", RHEMIFY_ANCHOR_PROGRAM_ID.toBase58());
  row("PDA", pc.cyan(r.pda));
  row("bump", String(r.pda_bump));
  row("fleet_id", pc.dim(r.fleet_id));
  row("date", r.date);
  if (r.newly_anchored) {
    row("anchor tx", pc.green(r.tx_hash ?? "—"));
    row("slot", String(r.slot ?? "—"));
    row("status", pc.green("freshly anchored in this run"));
  } else if (r.match) {
    row("status", pc.dim("already anchored — on-chain root matches this trace"));
  } else {
    row("status", pc.yellow(
      "PDA exists from a previous anchor for this fleet+date, but its root " +
      "differs from this trace. To anchor this trace's hash, delete or rotate " +
      "the existing PDA, or wait until the next day's PDA slot.",
    ));
  }

  section("HASH CHAIN");
  row("computed root", pc.dim(r.computed_root));
  row("on-chain root", pc.dim(r.on_chain_root));
  row("match", r.match ? pc.green("✓ identical") : pc.red("✗ different"));

  section("EXPLORER");
  row("PDA", pc.cyan(r.explorer.pda));
  if (r.explorer.tx) row("anchor tx", pc.cyan(r.explorer.tx));

  console.log();
  if (r.match) {
    console.log(pc.green(`  ${pc.bold("Audit-grade proof:")} an auditor can independently re-derive the leaf,`));
    console.log(pc.green(`  query the PDA at ${r.pda},`));
    console.log(pc.green(`  and confirm the root committed at slot ${r.slot ?? "(existing)"}.`));
    console.log(pc.green(`  No competitor (Tenderly, Stripe, Foundry) ships this.`));
  }
  console.log();
}

export async function tracesVerify(argv: string[] = []): Promise<void> {
  let args: VerifyArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(pc.red(`error: ${(err as Error).message}\n`));
    printHelp();
    process.exit(2);
  }

  const convexUrl = resolveConvexUrl(args.convexUrl);
  const rpcUrl = args.rpcUrl ?? DEVNET_RPC;

  // 1. Load trace
  const { trace, event } = await loadTrace(convexUrl, args.traceId!);

  // 2. Compute deterministic leaf bytes from trace_hash
  const leaf = createHash("sha256").update(trace.trace_hash).digest();
  // Single-leaf tree: root = leaf
  const computedRoot = leaf;

  // 3. Derive PDA — user-scoped per Phase C
  const conn = new Connection(rpcUrl, "confirmed");
  const authority = loadKeypair();
  const fleetId = event.fleet_id;
  const date = dateForTrace(trace._creationTime);

  const [pda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("rhemify-daily"),
      authority.publicKey.toBuffer(),
      Buffer.from(fleetId),
      Buffer.from(date),
    ],
    RHEMIFY_ANCHOR_PROGRAM_ID,
  );

  // 4. Check if PDA exists
  let acct = await conn.getAccountInfo(pda);
  let txHash: string | null = null;
  let slot: number | null = null;
  let newlyAnchored = false;

  if (!acct) {
    // 5. Anchor it — build write_daily_root instruction
    const ixData = Buffer.concat([
      anchorDiscriminator("write_daily_root"),
      encodeBorshString(fleetId),
      encodeBorshString(date),
      Buffer.from(computedRoot), // merkle_root: [u8; 32]
      encodeU32LE(1), // trace_count: u32 (single-leaf "batch")
    ]);
    const ix = new TransactionInstruction({
      programId: RHEMIFY_ANCHOR_PROGRAM_ID,
      keys: [
        { pubkey: pda, isSigner: false, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: ixData,
    });
    console.log(pc.dim(`\n  anchoring trace ${trace.trace_id} to devnet (~0.001 SOL fee)...`));
    txHash = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority]);
    newlyAnchored = true;

    // Re-fetch the PDA to get the slot + on-chain data
    const confirmed = await conn.getTransaction(txHash, { maxSupportedTransactionVersion: 0 });
    slot = confirmed?.slot ?? null;
    acct = await conn.getAccountInfo(pda);
    if (!acct) throw new Error(`Anchor tx ${txHash} confirmed but PDA still not found`);
  }

  // 6. Read on-chain root from PDA account data
  const onChainRoot = parseOnChainRoot(acct.data, fleetId, date);
  if (!onChainRoot) {
    throw new Error(
      "Could not parse on-chain DailyRoot. The PDA exists but layout doesn't match — possibly stale schema or a different program version.",
    );
  }

  const match = onChainRoot.equals(computedRoot);

  const result: VerifyResult = {
    trace_id: trace.trace_id,
    computed_root: computedRoot.toString("hex"),
    pda: pda.toBase58(),
    pda_bump: bump,
    on_chain_root: onChainRoot.toString("hex"),
    match,
    fleet_id: fleetId,
    date,
    tx_hash: txHash,
    slot,
    newly_anchored: newlyAnchored,
    explorer: {
      tx: txHash ? `https://explorer.solana.com/tx/${txHash}?cluster=devnet` : null,
      pda: `https://explorer.solana.com/address/${pda.toBase58()}?cluster=devnet`,
    },
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  render(args, result);

  if (!match) process.exit(1);
}
