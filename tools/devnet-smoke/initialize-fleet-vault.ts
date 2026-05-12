/**
 * Devnet smoke test: initialize_fleet_vault on rhemify_dwallet.
 *
 * Proves the deployed bytecode (commit 149c077) accepts the user-scoped PDA
 * seeds (`[b"fleet-vault", authority.key(), fleet_id]`) introduced in
 * Phase C and creates the vault at the derived address. Hand-encodes the
 * Anchor instruction discriminator + borsh args; no IDL needed.
 *
 * Run: cd tools/devnet-smoke && bun install && bun run smoke
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PROGRAM_ID = new PublicKey("GPgdzfwQ4qG1QcqePY3uR6Uo8SvCwqxRYg7oDsXd5opc");
const RPC_URL = "https://api.devnet.solana.com";

function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function encodeBorshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function encodeU64LE(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n, 0);
  return buf;
}

async function main() {
  const conn = new Connection(RPC_URL, "confirmed");

  const keypairFile = `${process.env.HOME}/.config/solana/id.json`;
  const secretKey = new Uint8Array(JSON.parse(readFileSync(keypairFile, "utf-8")));
  const authority = Keypair.fromSecretKey(secretKey);

  console.log("Authority:    ", authority.publicKey.toBase58());
  const balance = await conn.getBalance(authority.publicKey);
  console.log("Balance:      ", (balance / 1e9).toFixed(4), "SOL");

  if (balance < 0.01 * 1e9) {
    throw new Error("Insufficient balance — need at least 0.01 SOL for tx + rent");
  }

  // Unique fleet_id per run so we never collide with prior runs
  const fleetId = `e2e-${Date.now()}`;
  const treasuryDwalletId = "treasury-smoke-1";
  const coSigner = Keypair.generate().publicKey;
  const dailyCap = 1_000_000n; // 1M base units (e.g. 1 USDC if 6-decimal token)

  console.log("Fleet ID:     ", fleetId);
  console.log("Treasury ID:  ", treasuryDwalletId);
  console.log("Co-signer:    ", coSigner.toBase58());
  console.log("Daily cap:    ", dailyCap.toString());

  // Derive vault PDA with the user-scoped seeds from Phase C
  const [vaultPda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("fleet-vault"),
      authority.publicKey.toBuffer(),
      Buffer.from(fleetId),
    ],
    PROGRAM_ID,
  );
  console.log("Vault PDA:    ", vaultPda.toBase58(), "(bump:", bump, ")");

  const data = Buffer.concat([
    anchorDiscriminator("initialize_fleet_vault"),
    encodeBorshString(fleetId),
    encodeBorshString(treasuryDwalletId),
    coSigner.toBuffer(),
    encodeU64LE(dailyCap),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  console.log("\nSubmitting tx to devnet...");
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);

  console.log("\nTx confirmed.");
  console.log("Signature:    ", sig);
  console.log("Explorer:     ", `https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  const accountInfo = await conn.getAccountInfo(vaultPda);
  if (!accountInfo) {
    throw new Error("Vault PDA was not created on-chain");
  }
  console.log("\nVault account verified on-chain:");
  console.log("  Size:       ", accountInfo.data.length, "bytes");
  console.log("  Owner:      ", accountInfo.owner.toBase58());
  console.log("  Lamports:   ", accountInfo.lamports, `(${(accountInfo.lamports / 1e9).toFixed(4)} SOL rent)`);

  const finalBalance = await conn.getBalance(authority.publicKey);
  console.log("\nFinal balance:", (finalBalance / 1e9).toFixed(4), "SOL");
  console.log("Tx + rent cost:", ((balance - finalBalance) / 1e9).toFixed(6), "SOL");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  if (err.logs) console.error("Logs:", err.logs);
  process.exit(1);
});
