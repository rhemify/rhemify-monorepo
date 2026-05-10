/**
 * Devnet proof: vault.daily_cap is enforced in approve_signing.
 *
 * Pre-Phase-C, FleetVault.daily_cap was written at init but
 * approve_signing only checked the per-agent daily_limit. This script
 * proves the dead field is now load-bearing:
 *
 *   1. init a vault with daily_cap = 10000
 *   2. register an agent under it with daily_limit = 100000 (very loose,
 *      so we don't trip the agent check before the fleet check)
 *   3. approve_signing(amount=8000) — succeeds, vault.daily_spent now 8000
 *   4. approve_signing(amount=5000) — must FAIL with ExceedsFleetDailyCap
 *      because 8000 + 5000 = 13000 > 10000
 *
 * The script catches the second call's error and asserts the program
 * logs include "ExceedsFleetDailyCap". If the assertion fails, the test
 * fails (no false positives where a different error code accidentally
 * matched).
 *
 * Run: cd tools/devnet-smoke && bun run daily-cap
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  SendTransactionError,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PROGRAM_ID = new PublicKey("GPgdzfwQ4qG1QcqePY3uR6Uo8SvCwqxRYg7oDsXd5opc");
const RPC_URL = "https://api.devnet.solana.com";
const COSIGNER_FUNDING_LAMPORTS = 0.05 * LAMPORTS_PER_SOL;

const DAILY_CAP = 10_000n;          // small — easy to overshoot
const AGENT_MAX_PER_TX = 20_000n;   // ≥ any amount we'll use
const AGENT_DAILY_LIMIT = 100_000n; // way above DAILY_CAP — won't trip agent check first
const FIRST_AMOUNT = 8_000n;        // 8000 ≤ 10000 → succeeds, vault_spent=8000
const SECOND_AMOUNT = 5_000n;       // 8000+5000=13000 > 10000 → ExceedsFleetDailyCap

function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function borshVecString(items: string[]): Buffer {
  const count = Buffer.alloc(4);
  count.writeUInt32LE(items.length, 0);
  return Buffer.concat([count, ...items.map(borshString)]);
}

function u64LE(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b;
}

function pdaFleetVault(authority: PublicKey, fleetId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fleet-vault"), authority.toBuffer(), Buffer.from(fleetId)],
    PROGRAM_ID,
  );
}

function pdaAgentWallet(authority: PublicKey, fleetId: string, agentKey: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent-wallet"), authority.toBuffer(), Buffer.from(fleetId), Buffer.from(agentKey)],
    PROGRAM_ID,
  );
}

function pdaSigningApproval(agentWallet: PublicKey, nonce: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("signing-approval"), agentWallet.toBuffer(), Buffer.from(nonce)],
    PROGRAM_ID,
  );
}

function ixInitVault(args: {
  authority: PublicKey;
  vault: PublicKey;
  fleetId: string;
  treasury: string;
  coSigner: PublicKey;
  dailyCap: bigint;
}): TransactionInstruction {
  const data = Buffer.concat([
    disc("initialize_fleet_vault"),
    borshString(args.fleetId),
    borshString(args.treasury),
    args.coSigner.toBuffer(),
    u64LE(args.dailyCap),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.vault, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function ixRegisterAgent(args: {
  authority: PublicKey;
  vault: PublicKey;
  agent: PublicKey;
  fleetId: string;
  agentKey: string;
  dwalletId: string;
  maxPerTx: bigint;
  dailyLimit: bigint;
  allowedChains: string[];
}): TransactionInstruction {
  const data = Buffer.concat([
    disc("register_agent_wallet"),
    borshString(args.fleetId),
    borshString(args.agentKey),
    borshString(args.dwalletId),
    u64LE(args.maxPerTx),
    u64LE(args.dailyLimit),
    borshVecString(args.allowedChains),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.vault, isSigner: false, isWritable: false },
      { pubkey: args.agent, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function ixApproveSigning(args: {
  vault: PublicKey;
  agent: PublicKey;
  approval: PublicKey;
  coSigner: PublicKey;
  targetChain: string;
  targetAddress: string;
  amount: bigint;
  nonce: string;
}): TransactionInstruction {
  const data = Buffer.concat([
    disc("approve_signing"),
    borshString(args.targetChain),
    borshString(args.targetAddress),
    u64LE(args.amount),
    borshString(args.nonce),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.vault, isSigner: false, isWritable: true },
      { pubkey: args.agent, isSigner: false, isWritable: true },
      { pubkey: args.approval, isSigner: false, isWritable: true },
      { pubkey: args.coSigner, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function main() {
  const conn = new Connection(RPC_URL, "confirmed");

  const legitKey = `${process.env.HOME}/.config/solana/id.json`;
  const authority = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(legitKey, "utf-8"))),
  );
  const coSigner = Keypair.generate();

  console.log("Authority:    ", authority.publicKey.toBase58());
  console.log("Co-signer:    ", coSigner.publicKey.toBase58());
  console.log();

  // Unique IDs per run
  const fleetId = `cap-${Date.now()}`;
  const agentKey = "agent-1";
  const dwalletId = "dwallet-cap-test";

  const [vault] = pdaFleetVault(authority.publicKey, fleetId);
  const [agent] = pdaAgentWallet(authority.publicKey, fleetId, agentKey);

  console.log("Fleet:        ", fleetId);
  console.log("Vault PDA:    ", vault.toBase58());
  console.log("Agent PDA:    ", agent.toBase58());
  console.log();
  console.log("Limits — vault.daily_cap:    ", DAILY_CAP.toString());
  console.log("       — agent.max_per_tx:   ", AGENT_MAX_PER_TX.toString());
  console.log("       — agent.daily_limit:  ", AGENT_DAILY_LIMIT.toString());
  console.log();

  // [1/5] Init vault with co_signer we control
  console.log("[1/5] Init vault...");
  const sigInit = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(
      ixInitVault({
        authority: authority.publicKey,
        vault,
        fleetId,
        treasury: "treasury-cap-test",
        coSigner: coSigner.publicKey,
        dailyCap: DAILY_CAP,
      }),
    ),
    [authority],
  );
  console.log("      tx:", sigInit);

  // [2/5] Register agent
  console.log("[2/5] Register agent...");
  const sigReg = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(
      ixRegisterAgent({
        authority: authority.publicKey,
        vault,
        agent,
        fleetId,
        agentKey,
        dwalletId,
        maxPerTx: AGENT_MAX_PER_TX,
        dailyLimit: AGENT_DAILY_LIMIT,
        allowedChains: ["solana"],
      }),
    ),
    [authority],
  );
  console.log("      tx:", sigReg);

  // [3/5] Fund the co_signer
  console.log("[3/5] Fund co-signer with 0.05 SOL...");
  const sigFund = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: coSigner.publicKey,
        lamports: COSIGNER_FUNDING_LAMPORTS,
      }),
    ),
    [authority],
  );
  console.log("      tx:", sigFund);

  // [4/5] First approve_signing — expected to SUCCEED
  console.log("[4/5] approve_signing #1 (amount=8000, under cap) — expect SUCCESS");
  const nonce1 = `n-${Date.now()}-a`;
  const [approval1] = pdaSigningApproval(agent, nonce1);
  const sigApprove1 = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(
      ixApproveSigning({
        vault,
        agent,
        approval: approval1,
        coSigner: coSigner.publicKey,
        targetChain: "solana",
        targetAddress: "11111111111111111111111111111111",
        amount: FIRST_AMOUNT,
        nonce: nonce1,
      }),
    ),
    [coSigner],
  );
  console.log("      tx:", sigApprove1, "(vault.daily_spent now 8000)");

  // [5/5] Second approve_signing — expected to FAIL with ExceedsFleetDailyCap
  console.log("[5/5] approve_signing #2 (amount=5000, would push over cap) — expect FAIL");
  const nonce2 = `n-${Date.now()}-b`;
  const [approval2] = pdaSigningApproval(agent, nonce2);
  let failedAsExpected = false;
  let failureLogs: string[] = [];
  try {
    await sendAndConfirmTransaction(
      conn,
      new Transaction().add(
        ixApproveSigning({
          vault,
          agent,
          approval: approval2,
          coSigner: coSigner.publicKey,
          targetChain: "solana",
          targetAddress: "11111111111111111111111111111111",
          amount: SECOND_AMOUNT,
          nonce: nonce2,
        }),
      ),
      [coSigner],
    );
    console.log("      UNEXPECTED SUCCESS — daily_cap is NOT enforced");
  } catch (err) {
    const e = err as SendTransactionError & { logs?: string[] };
    failureLogs = e.logs ?? [];
    const matched = failureLogs.some((l) => l.includes("ExceedsFleetDailyCap"));
    if (matched) {
      failedAsExpected = true;
      console.log("      tx FAILED as expected with ExceedsFleetDailyCap.");
    } else {
      console.error("      Tx failed but NOT with ExceedsFleetDailyCap:");
      failureLogs.slice(-10).forEach((l) => console.error("        ", l));
      throw new Error("daily_cap test failed: wrong error code");
    }
  }

  if (!failedAsExpected) {
    throw new Error("daily_cap test failed: second approve_signing did not reject");
  }

  console.log();
  console.log("PROOF:");
  console.log("  Vault PDA           :", vault.toBase58());
  console.log("  Agent PDA           :", agent.toBase58());
  console.log("  init vault tx       :", sigInit);
  console.log("  register agent tx   :", sigReg);
  console.log("  approve #1 (success):", sigApprove1);
  console.log("  approve #2 (failed )  → rejected with ExceedsFleetDailyCap (expected)");
  console.log();
  console.log("  → vault.daily_cap (10000) is now load-bearing in approve_signing.");
  console.log("    Pre-Phase-C the field was ignored and the second call would have");
  console.log("    succeeded silently. Audit #6 closed with active proof.");
  console.log();
  console.log("Explorer links:");
  console.log("  init vault:     https://explorer.solana.com/tx/" + sigInit + "?cluster=devnet");
  console.log("  register agent: https://explorer.solana.com/tx/" + sigReg + "?cluster=devnet");
  console.log("  approve #1:     https://explorer.solana.com/tx/" + sigApprove1 + "?cluster=devnet");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  if (err.logs) console.error("Logs:", err.logs);
  process.exit(1);
});
