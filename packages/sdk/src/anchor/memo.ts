/**
 * Builds and sends Solana Memo transactions for trace anchoring.
 * Uses @solana/kit for transaction construction — no legacy web3.js.
 *
 * Memo program: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
 * Max memo size: 566 bytes. Our payload is ~200 bytes.
 */

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export interface MemoPayload {
  /** Always "rhemos-trace" */
  op: string;
  /** Trace ID (trc_...) */
  id: string;
  /** SHA-256 hex of canonical trace fields */
  hash: string;
  /** Fleet ID */
  fleet: string;
  /** Agent ID */
  agent: string;
  /** Unix timestamp (seconds) */
  ts: number;
}

export interface SendMemoOptions {
  traceId: string;
  traceHash: string;
  fleetId: string;
  agentId: string;
  timestamp: number;
  solanaPrivateKey: string;
  rpcUrl: string;
}

/**
 * Send a Solana Memo transaction anchoring a trace hash onchain.
 * Returns the transaction signature (base58).
 *
 * Uses dynamic import of @solana/kit — fails gracefully if not installed.
 */
export async function sendMemoTransaction(
  options: SendMemoOptions,
): Promise<string> {
  const payload: MemoPayload = {
    op: "rhemos-trace",
    id: options.traceId,
    hash: options.traceHash,
    fleet: options.fleetId,
    agent: options.agentId,
    ts: options.timestamp,
  };

  const memoData = JSON.stringify(payload);
  if (memoData.length > 566) {
    throw new Error(`Memo payload exceeds 566 byte limit: ${memoData.length} bytes`);
  }

  // Dynamic import of @solana/kit
  // @ts-expect-error -- optional peer dep
  const solanaKit = await import("@solana/kit");

  // Create keypair signer from private key bytes
  const { decodeSolanaKey } = await import("../utils/keys.js");
  const keyBytes = decodeSolanaKey(options.solanaPrivateKey);
  const keypair = await solanaKit.createKeyPairFromBytes(keyBytes);
  const signer = await solanaKit.createSignerFromKeyPair(keypair);

  // Create RPC connection
  const rpc = solanaKit.createSolanaRpc(options.rpcUrl);
  const rpcSubscriptions = solanaKit.createSolanaRpcSubscriptions(
    options.rpcUrl.replace("https://", "wss://").replace("http://", "ws://"),
  );

  // Build memo instruction
  const memoInstruction = {
    programAddress: solanaKit.address(MEMO_PROGRAM_ID),
    accounts: [
      {
        address: signer.address,
        role: solanaKit.AccountRole.WRITABLE_SIGNER,
      },
    ],
    data: new TextEncoder().encode(memoData),
  };

  // Build and send transaction
  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash()
    .send();

  const transaction = solanaKit.pipe(
    solanaKit.createTransactionMessage({ version: 0 }),
    (message: unknown) => solanaKit.setTransactionMessageFeePayer(signer.address, message),
    (message: unknown) =>
      solanaKit.setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message),
    (message: unknown) =>
      solanaKit.appendTransactionMessageInstruction(memoInstruction, message),
  );

  const signedTransaction = await solanaKit.signTransactionMessageWithSigners(transaction);

  const signature = await solanaKit
    .sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(
      signedTransaction,
      { commitment: "confirmed" },
    );

  // Encode signature to base58
  const { getBase58Decoder } = await import("@solana/codecs");
  return getBase58Decoder().decode(signature);
}

/**
 * Build a memo payload without sending (for testing/preview).
 */
export function buildMemoPayload(
  traceId: string,
  traceHash: string,
  fleetId: string,
  agentId: string,
  timestamp: number,
): MemoPayload {
  return {
    op: "rhemos-trace",
    id: traceId,
    hash: traceHash,
    fleet: fleetId,
    agent: agentId,
    ts: timestamp,
  };
}

