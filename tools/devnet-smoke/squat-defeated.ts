/**
 * Devnet proof: user-scoped seeds defeat the fleet_id squat attack.
 *
 * Two parties (legit + attacker, distinct keypairs) both call
 * initialize_fleet_vault with the SAME fleet_id. The post-Phase-C seeds
 * are `[b"fleet-vault", authority.key(), fleet_id]`, so the two derive
 * to DIFFERENT PDAs and both calls succeed independently. Under the old
 * `[b"fleet-vault", fleet_id]` seeds these would have collided at one
 * PDA and the second caller would lose to the first.
 *
 * Prints two tx hashes (legit + attacker), two PDA addresses (different),
 * and the OLD-seed PDA they would have shared (for narrative contrast).
 *
 * Run: cd tools/devnet-smoke && bun run squat
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PROGRAM_ID = new PublicKey("GPgdzfwQ4qG1QcqePY3uR6Uo8SvCwqxRYg7oDsXd5opc");
const RPC_URL = "https://api.devnet.solana.com";
const ATTACKER_FUNDING_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;

function discriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function u64LE(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b;
}

function vaultPdaNew(authority: PublicKey, fleetId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fleet-vault"), authority.toBuffer(), Buffer.from(fleetId)],
    PROGRAM_ID,
  );
}

// What the OLD (pre-Phase-C) seeds would have derived to. Both parties
// would have collided here under the original design. Shown for contrast.
function vaultPdaOldShared(fleetId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fleet-vault"), Buffer.from(fleetId)],
    PROGRAM_ID,
  );
}

function buildInitVaultIx(args: {
  payer: PublicKey;
  vaultPda: PublicKey;
  fleetId: string;
  treasuryDwalletId: string;
  coSigner: PublicKey;
  dailyCap: bigint;
}): TransactionInstruction {
  const data = Buffer.concat([
    discriminator("initialize_fleet_vault"),
    borshString(args.fleetId),
    borshString(args.treasuryDwalletId),
    args.coSigner.toBuffer(),
    u64LE(args.dailyCap),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.vaultPda, isSigner: false, isWritable: true },
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function main() {
  const conn = new Connection(RPC_URL, "confirmed");

  // Legit user: real keypair from disk
  const legitKey = `${process.env.HOME}/.config/solana/id.json`;
  const legit = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(legitKey, "utf-8"))),
  );

  // Attacker: fresh keypair, must be funded for tx fees + rent
  const attacker = Keypair.generate();

  console.log("Legit:        ", legit.publicKey.toBase58());
  console.log("Attacker:     ", attacker.publicKey.toBase58());
  console.log();

  const legitBalance = await conn.getBalance(legit.publicKey);
  console.log("Legit balance:", (legitBalance / LAMPORTS_PER_SOL).toFixed(4), "SOL");

  // Use the SAME fleet_id for both parties — this is the attack scenario
  const fleetId = `squat-${Date.now()}`;
  const treasuryId = "treasury-squat-test";
  const coSignerLegit = Keypair.generate().publicKey;
  const coSignerAttacker = Keypair.generate().publicKey;
  const dailyCap = 1_000_000n;

  console.log("Shared fleet_id (squat target):", fleetId);

  // Derive PDAs under post-Phase-C seeds
  const [legitVault, legitBump] = vaultPdaNew(legit.publicKey, fleetId);
  const [attackerVault, attackerBump] = vaultPdaNew(attacker.publicKey, fleetId);

  // What the OLD design would have given (same address for both)
  const [oldSharedPda, oldBump] = vaultPdaOldShared(fleetId);

  console.log();
  console.log("Post-Phase-C PDAs (each scoped by authority):");
  console.log("  Legit vault:    ", legitVault.toBase58(), `(bump: ${legitBump})`);
  console.log("  Attacker vault: ", attackerVault.toBase58(), `(bump: ${attackerBump})`);
  console.log();
  console.log("Old (pre-Phase-C) shared PDA — both would have collided here:");
  console.log("  Old PDA:        ", oldSharedPda.toBase58(), `(bump: ${oldBump})`);
  console.log();

  if (legitVault.equals(attackerVault)) {
    throw new Error("PDAs are equal — Phase C seeds are NOT user-scoped");
  }
  console.log("ASSERTED: legit and attacker PDAs differ.");
  console.log();

  // Step 1: legit user inits their vault
  console.log("[1/3] Legit user inits fleet:", fleetId);
  const ixLegit = buildInitVaultIx({
    payer: legit.publicKey,
    vaultPda: legitVault,
    fleetId,
    treasuryDwalletId: treasuryId,
    coSigner: coSignerLegit,
    dailyCap,
  });
  const sigLegit = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(ixLegit),
    [legit],
  );
  console.log("      tx:", sigLegit);
  console.log();

  // Step 2: fund the attacker (transfer 0.01 SOL from legit)
  console.log("[2/3] Funding attacker with 0.01 SOL...");
  const fund = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: legit.publicKey,
      toPubkey: attacker.publicKey,
      lamports: ATTACKER_FUNDING_LAMPORTS,
    }),
  );
  const fundSig = await sendAndConfirmTransaction(conn, fund, [legit]);
  console.log("      fund tx:", fundSig);
  console.log();

  // Step 3: attacker tries to "squat" the same fleet_id
  console.log("[3/3] Attacker inits same fleet_id (under their own authority):");
  const ixAttacker = buildInitVaultIx({
    payer: attacker.publicKey,
    vaultPda: attackerVault,
    fleetId,
    treasuryDwalletId: "treasury-attacker",
    coSigner: coSignerAttacker,
    dailyCap,
  });
  const sigAttacker = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(ixAttacker),
    [attacker],
  );
  console.log("      tx:", sigAttacker);
  console.log();

  // Verify both vaults exist and are independent
  const [legitInfo, attackerInfo] = await Promise.all([
    conn.getAccountInfo(legitVault),
    conn.getAccountInfo(attackerVault),
  ]);
  if (!legitInfo) throw new Error("legit vault not on-chain");
  if (!attackerInfo) throw new Error("attacker vault not on-chain");

  console.log("Both vaults verified independent on-chain:");
  console.log("  Legit vault size:    ", legitInfo.data.length, "bytes");
  console.log("  Attacker vault size: ", attackerInfo.data.length, "bytes");
  console.log();

  console.log("PROOF:");
  console.log("  Legit vault    :", legitVault.toBase58());
  console.log("  Attacker vault :", attackerVault.toBase58());
  console.log("  → distinct addresses, distinct authorities, both writes succeeded");
  console.log("  → under old `[b\"fleet-vault\", fleet_id]` seeds, these would have");
  console.log("    collided at", oldSharedPda.toBase58(), "and the second caller");
  console.log("    would have failed with `init: account already in use`. The squat");
  console.log("    attack is structurally impossible after Phase C.");
  console.log();

  console.log("Explorer links:");
  console.log("  legit init:    https://explorer.solana.com/tx/" + sigLegit + "?cluster=devnet");
  console.log("  attacker init: https://explorer.solana.com/tx/" + sigAttacker + "?cluster=devnet");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  if (err.logs) console.error("Logs:", err.logs);
  process.exit(1);
});
