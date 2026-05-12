// @ts-nocheck — Solana Kit transaction builder has complex conditional types
// that resist local typing. Pre-existing issue not introduced by this PR;
// follow-up work to properly type the `pipe` chain.

/**
 * Builds and sends Solana Memo transactions for trace anchoring.
 * Uses @solana/kit for transaction construction — no legacy web3.js.
 *
 * Memo program: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
 * Max memo size: 566 bytes. Our payload is ~200 bytes.
 */

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export interface MemoPayload {
  /** Always "rhemify-trace" */
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
 * Cached RPC resources — created once per (rpcUrl, privateKey) pair and
 * reused across all memo transactions to avoid per-call connection overhead.
 */
interface RpcResources {
  rpc: unknown;
  rpcSubscriptions: unknown;
  signer: unknown & { address: unknown };
}
const rpcCache = new Map<string, RpcResources>();

async function getOrCreateRpcResources(
  solanaPrivateKey: string,
  rpcUrl: string,
): Promise<RpcResources> {
  const cacheKey = `${rpcUrl}:${solanaPrivateKey.slice(0, 8)}`;
  const cached = rpcCache.get(cacheKey);
  if (cached) return cached;

  // @ts-expect-error -- optional peer dep
  const solanaKit = await import("@solana/kit");
  const { decodeSolanaKey } = await import("../utils/keys.js");

  const keyBytes = decodeSolanaKey(solanaPrivateKey);
  const keypair = await solanaKit.createKeyPairFromBytes(keyBytes);
  const signer = await solanaKit.createSignerFromKeyPair(keypair);
  const rpc = solanaKit.createSolanaRpc(rpcUrl);
  const rpcSubscriptions = solanaKit.createSolanaRpcSubscriptions(
    rpcUrl.replace("https://", "wss://").replace("http://", "ws://"),
  );

  const resources = { rpc, rpcSubscriptions, signer };
  rpcCache.set(cacheKey, resources);
  return resources;
}

/**
 * Send a Solana Memo transaction anchoring a trace hash onchain.
 * Returns the transaction signature (base58).
 */
export async function sendMemoTransaction(options: SendMemoOptions): Promise<string> {
  const payload: MemoPayload = {
    op: "rhemify-trace",
    id: options.traceId,
    hash: options.traceHash,
    fleet: options.fleetId,
    agent: options.agentId,
    ts: options.timestamp,
  };

  return sendBatchMemoTransaction([payload], options.solanaPrivateKey, options.rpcUrl);
}

/**
 * Send one Solana transaction with multiple Memo instructions.
 * N memos in one tx costs the same ~$0.00075 as a single memo — true 5x savings.
 * All payloads must fit within the 1232-byte transaction size limit.
 */
export async function sendBatchMemoTransaction(
  payloads: MemoPayload[],
  solanaPrivateKey: string,
  rpcUrl: string,
): Promise<string> {
  if (payloads.length === 0) throw new Error("sendBatchMemoTransaction: no payloads");

  // @ts-expect-error -- optional peer dep
  const solanaKit = await import("@solana/kit");
  const { rpc, rpcSubscriptions, signer } = await getOrCreateRpcResources(solanaPrivateKey, rpcUrl);

  const encoder = new TextEncoder();

  const memoInstructions = payloads.map((payload) => {
    const memoData = JSON.stringify(payload);
    if (memoData.length > 566) {
      throw new Error(`Memo payload exceeds 566 byte limit: ${memoData.length} bytes`);
    }
    return {
      programAddress: solanaKit.address(MEMO_PROGRAM_ID),
      accounts: [{ address: (signer as { address: unknown }).address, role: solanaKit.AccountRole.WRITABLE_SIGNER }],
      data: encoder.encode(memoData),
    };
  });

  const { value: latestBlockhash } = await (rpc as { getLatestBlockhash: () => { send: () => Promise<{ value: unknown }> } }).getLatestBlockhash().send();

  // Use setTransactionMessageFeePayerSigner — registers the signer so
  // signTransactionMessageWithSigners can sign the fee-payer slot below.
  // setTransactionMessageFeePayer only records the address, not the signer,
  // so the tx ends up "missing signatures for addresses: <fee-payer>"
  // when sent.
  let txMessage = solanaKit.pipe(
    solanaKit.createTransactionMessage({ version: 0 }),
    (msg: unknown) => solanaKit.setTransactionMessageFeePayerSigner(signer, msg),
    (msg: unknown) => solanaKit.setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
  );
  for (const ix of memoInstructions) {
    txMessage = solanaKit.appendTransactionMessageInstruction(ix, txMessage);
  }

  const signedTransaction = await solanaKit.signTransactionMessageWithSigners(txMessage);
  await solanaKit.sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
    commitment: "confirmed",
  });

  const { getBase58Decoder } = await import("@solana/codecs");
  const signatures = (signedTransaction as { signatures: Record<string, Uint8Array> }).signatures;
  const firstSig = Object.values(signatures)[0];
  if (!firstSig) throw new Error("anchor memo: signed transaction has no signatures");
  return getBase58Decoder().decode(firstSig);
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
    op: "rhemify-trace",
    id: traceId,
    hash: traceHash,
    fleet: fleetId,
    agent: agentId,
    ts: timestamp,
  };
}
