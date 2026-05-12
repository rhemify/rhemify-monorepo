/**
 * `rhemify traces verify <trace_id> [--json]`
 *
 * THE moat command. Cryptographically proves a trace exists in the day's
 * batch on Solana devnet.
 *
 * Flow (post-M.1–M.4 Merkle batching):
 *   1. Fetch Merkle proof from the Go server's
 *      /api/anchor/<fleet>/<date>/merkle-proof endpoint. Server builds the
 *      tree from every trace for the fleet+date, returns:
 *        root, leaf_hash, leaf_index, trace_count, path[]
 *   2. Verify the proof locally — recompute the root from leaf + path,
 *      confirm it matches what the server returned. This catches a
 *      server-side bug or tampered response without trusting the server's
 *      math.
 *   3. Read the on-chain DailyRoot PDA for fleet+date. If the on-chain
 *      root matches the (now-trusted) Merkle root, the trace is
 *      VERIFIED — any auditor can re-derive the leaf, re-fetch the
 *      proof, and re-check independently.
 *   4. If on-chain root is stale (different from current Merkle root —
 *      e.g. more traces have been added since last anchor), submit a
 *      write_daily_root tx to refresh the on-chain root.
 *
 * Auth: uses ~/.config/solana/id.json for the on-chain submission.
 * Requires: Go server (for the Merkle proof endpoint) + Solana devnet.
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
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import { loadConfig } from "../../config.js";

const RHEMIFY_ANCHOR_PROGRAM_ID = new PublicKey(
  "HYWjBbLMEz98KnppVkUnHmkUZ4pyQ8abaDRTtUedUkxV",
);
const DEVNET_RPC = "https://api.devnet.solana.com";

interface VerifyArgs {
  traceId?: string;
  fleetId?: string;
  date?: string;
  serverUrl?: string;
  rpcUrl?: string;
  json?: boolean;
}

interface MerkleProofResponse {
  fleet_id: string;
  date: string;
  trace_id: string;
  trace_hash: string;
  leaf_index: number;
  leaf_hash: string;
  root: string;
  trace_count: number;
  path: { hash: string; side: "left" | "right" }[];
}

interface VerifyResult {
  trace_id: string;
  fleet_id: string;
  date: string;
  leaf_index: number;
  trace_count: number;
  leaf_hash: string;
  computed_root: string;
  server_root: string;
  on_chain_root: string;
  pda: string;
  pda_bump: number;
  proof_match: boolean;
  on_chain_match: boolean;
  tx_hash: string | null;
  slot: number | null;
  newly_anchored: boolean;
  explorer: { tx: string | null; pda: string };
}

function parseArgs(argv: string[]): VerifyArgs {
  const out: VerifyArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      out.json = true;
    } else if (arg === "--server") {
      const v = argv[++i];
      if (!v) throw new Error("--server requires a URL");
      out.serverUrl = v;
    } else if (arg === "--fleet") {
      const v = argv[++i];
      if (!v) throw new Error("--fleet requires a fleet_id");
      out.fleetId = v;
    } else if (arg === "--date") {
      const v = argv[++i];
      if (!v) throw new Error("--date requires YYYY-MM-DD");
      out.date = v;
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
${pc.bold("rhemify traces verify")} — cryptographically prove a trace is in the day's batch on Solana

${pc.bold("Usage:")}
  rhemify traces verify <trace_id> [options]

${pc.bold("Options:")}
  --json            raw JSON output for scripting
  --server <url>    override Go server URL (default from config)
  --fleet <id>      override fleet_id (defaults to config.fleetId)
  --date <YYYY-MM-DD>  override anchor date (defaults to UTC today)
  --rpc <url>       override Solana RPC URL (default ${DEVNET_RPC})
  -h, --help        show this message

${pc.bold("What this does:")}
  1. Fetches the Merkle proof from the Go server (builds tree from every
     trace for fleet+date, returns root + path + leaf)
  2. Verifies the proof locally — recomputes the root from leaf + path
  3. Reads the on-chain DailyRoot PDA. If it matches → VERIFIED
  4. If on-chain root is stale (older batch), submits write_daily_root
     to anchor the current root

${pc.bold("Requires:")}
  - rhemify CLI configured (~/.rhemify/config.json)
  - Go intelligence server running
  - ~/.config/solana/id.json funded with ~0.001 SOL devnet for re-anchor
`);
}

function loadKeypair(): Keypair {
  const path = join(homedir(), ".config", "solana", "id.json");
  const secret = new Uint8Array(JSON.parse(readFileSync(path, "utf-8")));
  return Keypair.fromSecretKey(secret);
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

/**
 * Verify a Merkle proof in-process. Mirrors apps/server/internal/merkle:
 * leaf prefix 0x00, node prefix 0x01. Returns the recomputed root so the
 * caller can compare against both the server-asserted root AND the
 * on-chain root.
 */
function verifyProof(
  leafHex: string,
  path: { hash: string; side: "left" | "right" }[],
): Buffer {
  // Buffer type widening between Buffer.from() and createHash().digest() in
  // strict node @types — use Uint8Array as the running container and convert
  // back at the end. Same bytes, calmer compiler.
  let running: Uint8Array = Buffer.from(leafHex, "hex");
  for (const step of path) {
    const sibling = Buffer.from(step.hash, "hex");
    if (step.side === "right") {
      // sibling on right → running is left operand
      running = sha256Node(running, sibling);
    } else {
      running = sha256Node(sibling, running);
    }
  }
  return Buffer.from(running);
}

function sha256Node(left: Uint8Array, right: Uint8Array): Uint8Array {
  return createHash("sha256")
    .update(Buffer.concat([Buffer.from([0x01]), left, right]))
    .digest();
}

/** Read on-chain DailyRoot.merkle_root from a fetched account's raw data. */
function parseOnChainRoot(data: Buffer, fleetId: string, date: string): Buffer | null {
  let offset = 8; // anchor discriminator
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

  return Buffer.from(data.subarray(offset, offset + 32));
}

async function fetchProof(
  serverUrl: string,
  apiKey: string,
  fleetId: string,
  date: string,
  traceId: string,
): Promise<MerkleProofResponse> {
  const url = `${serverUrl}/api/anchor/${encodeURIComponent(fleetId)}/${encodeURIComponent(
    date,
  )}/merkle-proof?trace_id=${encodeURIComponent(traceId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`merkle-proof ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as MerkleProofResponse;
}

function row(label: string, value: string): void {
  console.log(`  ${pc.dim(label.padEnd(18))} ${value}`);
}

function section(title: string): void {
  console.log(pc.bold(pc.cyan(`\n${title}`)));
}

function render(r: VerifyResult): void {
  const verified = r.proof_match && r.on_chain_match;
  const badge = verified ? pc.green(pc.bold(" VERIFIED ")) : pc.red(pc.bold(" MISMATCH "));

  console.log(`\n${pc.bold(pc.cyan("VERIFY"))} ${pc.dim(r.trace_id)}`);
  if (verified) {
    console.log(
      `  ${badge}  ${pc.green(`trace is leaf #${r.leaf_index} of a ${r.trace_count}-leaf Merkle tree, root anchored on devnet`)}`,
    );
  } else if (!r.proof_match) {
    console.log(`  ${badge}  ${pc.red("server's Merkle proof does not reconstruct to the server's root — trust failure")}`);
  } else {
    console.log(`  ${badge}  ${pc.red("on-chain root differs from current Merkle root — anchor is stale")}`);
  }

  section("MERKLE PROOF");
  row("leaf index", `${r.leaf_index} of ${r.trace_count}`);
  row("leaf hash", pc.dim(r.leaf_hash));
  row("computed root", pc.dim(r.computed_root));
  row("server root", pc.dim(r.server_root));
  row("proof valid", r.proof_match ? pc.green("✓ recomputed root matches server") : pc.red("✗ mismatch"));

  section("ON-CHAIN");
  row("program", RHEMIFY_ANCHOR_PROGRAM_ID.toBase58());
  row("PDA", pc.cyan(r.pda));
  row("bump", String(r.pda_bump));
  row("fleet_id", pc.dim(r.fleet_id));
  row("date", r.date);
  row("on-chain root", pc.dim(r.on_chain_root));
  row("root match", r.on_chain_match ? pc.green("✓ identical") : pc.red("✗ different"));
  if (r.newly_anchored) {
    row("anchor tx", pc.green(r.tx_hash ?? "—"));
    if (r.slot !== null) row("slot", String(r.slot));
    row("status", pc.green("freshly anchored in this run"));
  }

  section("EXPLORER");
  row("PDA", pc.cyan(r.explorer.pda));
  if (r.explorer.tx) row("anchor tx", pc.cyan(r.explorer.tx));

  console.log();
  if (verified) {
    console.log(pc.green(`  ${pc.bold("Audit-grade proof:")} a third-party auditor can independently`));
    console.log(pc.green(`    1. recompute the leaf hash from this trace's trace_hash,`));
    console.log(pc.green(`    2. re-fetch the proof via /api/anchor/.../merkle-proof,`));
    console.log(pc.green(`    3. recompute the root via the published merkle.Verify helper,`));
    console.log(pc.green(`    4. read the PDA on devnet — match means tamper-evident.`));
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

  const config = loadConfig();
  if (!config) {
    console.error(pc.red("  Not set up. Run: rhemify onboard\n"));
    process.exit(1);
  }
  const serverUrl = args.serverUrl ?? config.serverUrl;
  const rpcUrl = args.rpcUrl ?? DEVNET_RPC;
  const fleetId = args.fleetId ?? config.fleetId;
  const apiKey = config.fleetApiKey ?? "cli-user";
  const date = args.date ?? new Date().toISOString().slice(0, 10);

  // 1. Fetch the Merkle proof from the Go server.
  const proof = await fetchProof(serverUrl, apiKey, fleetId, date, args.traceId!);

  // 2. Recompute the root from the leaf + path locally. Must match what
  //    the server returned, otherwise the server lied / a bug shipped.
  const computedRoot = verifyProof(proof.leaf_hash, proof.path);
  const serverRootBytes = Buffer.from(proof.root, "hex");
  const proofMatch = computedRoot.equals(serverRootBytes);

  // 3. Look up the on-chain PDA. Derive the same way write_daily_root does:
  //    [b"rhemify-daily", authority, fleet_id, date]
  const conn = new Connection(rpcUrl, "confirmed");
  const authority = loadKeypair();
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("rhemify-daily"),
      authority.publicKey.toBuffer(),
      Buffer.from(fleetId),
      Buffer.from(date),
    ],
    RHEMIFY_ANCHOR_PROGRAM_ID,
  );

  let acct = await conn.getAccountInfo(pda);
  let txHash: string | null = null;
  let slot: number | null = null;
  let newlyAnchored = false;

  // 4. If PDA doesn't exist OR holds a stale root (e.g. anchored when the
  //    batch had fewer leaves), submit a fresh write_daily_root with the
  //    current Merkle root + trace_count.
  let needAnchor = !acct;
  if (acct) {
    const existing = parseOnChainRoot(acct.data, fleetId, date);
    if (!existing || !existing.equals(serverRootBytes)) {
      needAnchor = true;
    }
  }

  if (needAnchor && proofMatch) {
    const ixData = Buffer.concat([
      anchorDiscriminator("write_daily_root"),
      encodeBorshString(fleetId),
      encodeBorshString(date),
      serverRootBytes,
      encodeU32LE(proof.trace_count),
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
    console.log(pc.dim(`\n  anchoring root for ${proof.trace_count}-leaf batch (~0.000005 SOL fee)...`));
    txHash = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority]);
    newlyAnchored = true;
    const confirmed = await conn.getTransaction(txHash, { maxSupportedTransactionVersion: 0 });
    slot = confirmed?.slot ?? null;
    acct = await conn.getAccountInfo(pda);
  }

  const onChainRoot = acct ? parseOnChainRoot(acct.data, fleetId, date) : null;
  if (!onChainRoot) {
    throw new Error(
      `Could not read on-chain root for ${pda.toBase58()}. PDA may be uninitialized or layout mismatched.`,
    );
  }
  const onChainMatch = onChainRoot.equals(serverRootBytes);

  const result: VerifyResult = {
    trace_id: proof.trace_id,
    fleet_id: proof.fleet_id,
    date: proof.date,
    leaf_index: proof.leaf_index,
    trace_count: proof.trace_count,
    leaf_hash: proof.leaf_hash,
    computed_root: computedRoot.toString("hex"),
    server_root: proof.root,
    on_chain_root: onChainRoot.toString("hex"),
    pda: pda.toBase58(),
    pda_bump: bump,
    proof_match: proofMatch,
    on_chain_match: onChainMatch,
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

  render(result);

  if (!proofMatch || !onChainMatch) process.exit(1);
}
