/**
 * Builds and sends Solana Memo transactions for trace anchoring.
 * Uses @solana/kit for transaction construction — no legacy web3.js.
 *
 * Memo program: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
 * Max memo size: 566 bytes. Our payload is ~200 bytes.
 *
 * `@solana/kit` is listed as both a regular and optional-peer dep. The
 * runtime loader uses `await import("@solana/kit")` to stay friendly to
 * bundlers that exclude optional peers, but types come from a static
 * `import type *` so the pipe chain below is fully type-checked instead of
 * relying on `@ts-nocheck` like the previous revision did.
 */

import type * as SolanaKit from "@solana/kit";

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/**
 * @solana/kit's `KeyPairSigner` is the runtime shape returned by
 * `createSignerFromKeyPair`. Pinning to this name lets the typed pipe chain
 * carry the signer's address all the way through `setTransactionMessageFeePayerSigner`.
 */
type KitSigner = SolanaKit.KeyPairSigner;
type KitRpc = ReturnType<typeof SolanaKit.createSolanaRpc>;
type KitRpcSubscriptions = ReturnType<typeof SolanaKit.createSolanaRpcSubscriptions>;

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
  rpc: KitRpc;
  rpcSubscriptions: KitRpcSubscriptions;
  signer: KitSigner;
}
const rpcCache = new Map<string, RpcResources>();

async function loadSolanaKit(): Promise<typeof SolanaKit> {
  return (await import("@solana/kit")) as typeof SolanaKit;
}

async function getOrCreateRpcResources(
  solanaPrivateKey: string,
  rpcUrl: string,
): Promise<RpcResources> {
  const cacheKey = `${rpcUrl}:${solanaPrivateKey.slice(0, 8)}`;
  const cached = rpcCache.get(cacheKey);
  if (cached) return cached;

  const solanaKit = await loadSolanaKit();
  const { decodeSolanaKey } = await import("../utils/keys.js");

  const keyBytes = decodeSolanaKey(solanaPrivateKey);
  const keypair = await solanaKit.createKeyPairFromBytes(keyBytes);
  const signer = await solanaKit.createSignerFromKeyPair(keypair);
  const rpc = solanaKit.createSolanaRpc(rpcUrl);
  const rpcSubscriptions = solanaKit.createSolanaRpcSubscriptions(
    rpcUrl.replace("https://", "wss://").replace("http://", "ws://"),
  );

  const resources: RpcResources = { rpc, rpcSubscriptions, signer };
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

  const solanaKit = await loadSolanaKit();
  const { rpc, rpcSubscriptions, signer } = await getOrCreateRpcResources(
    solanaPrivateKey,
    rpcUrl,
  );

  const encoder = new TextEncoder();
  const memoProgramAddress = solanaKit.address(MEMO_PROGRAM_ID);

  const memoInstructions = payloads.map((payload) => {
    const memoData = JSON.stringify(payload);
    if (memoData.length > 566) {
      throw new Error(`Memo payload exceeds 566 byte limit: ${memoData.length} bytes`);
    }
    return {
      programAddress: memoProgramAddress,
      accounts: [
        {
          address: signer.address,
          role: solanaKit.AccountRole.WRITABLE_SIGNER,
          signer,
        },
      ],
      data: encoder.encode(memoData),
    };
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  // setTransactionMessageFeePayerSigner registers the signer so
  // signTransactionMessageWithSigners can sign the fee-payer slot below.
  // setTransactionMessageFeePayer only records the address, not the signer,
  // so the tx ends up "missing signatures for addresses: <fee-payer>" when
  // sent (regression history in commit 9b04d89).
  const baseMessage = solanaKit.createTransactionMessage({ version: 0 });
  const withFeePayer = solanaKit.setTransactionMessageFeePayerSigner(signer, baseMessage);
  const withLifetime = solanaKit.setTransactionMessageLifetimeUsingBlockhash(
    latestBlockhash,
    withFeePayer,
  );
  // `appendTransactionMessageInstructions` (plural) folds the batch in one
  // call, sidestepping the per-iteration generic widening that breaks the
  // single-ix variant when called from a loop.
  const txMessage = solanaKit.appendTransactionMessageInstructions(
    memoInstructions,
    withLifetime,
  );

  const signedTransaction = await solanaKit.signTransactionMessageWithSigners(txMessage);
  // `sendAndConfirmTransactionFactory` overloads narrow by cluster brand
  // (`'~cluster': "mainnet" | "devnet" | ...`). `createSolanaRpc(rpcUrl)`
  // returns the union of all clusters because rpcUrl is a runtime `string`,
  // so the overload picker can't choose. Caller passes a homogeneous pair
  // (both devnet, both mainnet, etc.) — narrowing locally via `as never` so
  // we don't widen the cached `RpcResources` types for every consumer.
  const sendAndConfirm = solanaKit.sendAndConfirmTransactionFactory({
    rpc: rpc as never,
    rpcSubscriptions: rpcSubscriptions as never,
  });
  // Same union-narrowing reason on the signed-tx lifetime brand:
  // setTransactionMessageLifetimeUsingBlockhash sets a blockhash lifetime,
  // but the chain's typed result widens to `Blockhash | DurableNonce`. The
  // send fn rejects the union; cast here is sound because we set it above.
  await sendAndConfirm(signedTransaction as never, { commitment: "confirmed" });

  const { getBase58Decoder } = await import("@solana/codecs");
  const signatures = signedTransaction.signatures;
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
