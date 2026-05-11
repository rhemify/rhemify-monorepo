import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import { decodeSolanaKey } from "../utils/keys.js";
import type { PaymentExecutor } from "./types.js";

/**
 * MPP one-shot charge executor for Solana.
 *
 * Self-contained: anchors a memo transaction on Solana for each payment,
 * encoding the trace context (resource, amount, recipient, timestamp) into
 * the memo payload. The signed-and-submitted tx is then attached to the
 * upstream HTTP request as the Authorization header in an MPP-flavored
 * Payment token, so the resource gets a verifiable on-chain proof of
 * payment intent for the request it just served a 402 to.
 *
 * Same shape and rationale as x402-solana.ts (see that file for the
 * fuller explanation of why we don't dynamically import the upstream
 * peer-dep package). The headline differences from x402:
 *
 *   - Header is `Authorization: Payment <base64>` (MPP convention) rather
 *     than `X-Payment: <base64>` (x402 convention). The local test server
 *     in tools/test-402/server.ts accepts either, so both protocols round-
 *     trip there. A real MPP facilitator would expect the HMAC token shape
 *     produced by `@solana/mpp`; this executor sends a JSON-wrapped signed
 *     tx instead. Honest scope: works against any server that treats
 *     "Authorization present" as the gate; doesn't currently produce a
 *     mppx-conforming MAC.
 *
 *   - This is a SIGNED memo tx, NOT a USDC SPL-Token transfer. A future
 *     variant (`mppChargeTransferExecutor`) should do the real token
 *     transfer; for the audit-grade demo, the memo serves as cryptographic
 *     intent + payable trace anchor.
 */

interface Web3Connection {
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  sendRawTransaction(rawTx: Buffer | Uint8Array): Promise<string>;
  confirmTransaction(
    strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
    commitment?: string,
  ): Promise<{ value: { err: unknown } }>;
}

interface SolanaWeb3 {
  Connection: new (endpoint: string, commitment: string) => Web3Connection;
  Keypair: {
    fromSecretKey(bytes: Uint8Array): { publicKey: { toBase58(): string }; secretKey: Uint8Array };
  };
  PublicKey: new (key: string) => { toBase58(): string };
  Transaction: new () => {
    add(...ixs: unknown[]): unknown;
    recentBlockhash: string;
    feePayer: { toBase58(): string };
    sign(...signers: unknown[]): void;
    serialize(): Buffer;
  };
  TransactionInstruction: new (opts: {
    keys: { pubkey: unknown; isSigner: boolean; isWritable: boolean }[];
    programId: unknown;
    data: Buffer;
  }) => unknown;
}

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export const mppChargeExecutor: PaymentExecutor = {
  protocol: "mpp",
  networks: ["solana-mainnet", "solana-devnet", "devnet", "localnet", "mainnet-beta"],

  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean {
    return (
      detection.protocol === "mpp" &&
      isSolanaNetwork(detection.network) &&
      !!wallet.solanaPrivateKey
    );
  },

  async execute(
    url: string,
    detection: DetectionResult,
    wallet: WalletConfig,
    options: PayOptions,
  ): Promise<ExecutionResult> {
    if (!wallet.solanaPrivateKey) {
      throw new NoWalletError("solana");
    }

    let web3: SolanaWeb3;
    try {
      web3 = (await import("@solana/web3.js")) as unknown as SolanaWeb3;
    } catch {
      throw new ExecutionError("@solana/web3.js is not installed. Run: bun add @solana/web3.js");
    }

    const rpcUrl = resolveRpcUrl(detection.network);
    const connection = new web3.Connection(rpcUrl, "confirmed");
    const keyBytes = decodeSolanaKey(wallet.solanaPrivateKey);
    const keypair = web3.Keypair.fromSecretKey(keyBytes);

    const memoText = buildMemoText(detection, url);
    const memoIx = new web3.TransactionInstruction({
      keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
      programId: new web3.PublicKey(MEMO_PROGRAM_ID),
      data: Buffer.from(memoText, "utf-8"),
    });

    let signature: string;
    try {
      const tx = new web3.Transaction();
      tx.add(memoIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = keypair.publicKey;
      tx.sign(keypair);

      const rawTx = tx.serialize();
      signature = await connection.sendRawTransaction(rawTx);
      const conf = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      if (conf.value.err) {
        throw new ExecutionError(`Solana confirm failed: ${JSON.stringify(conf.value.err)}`);
      }
    } catch (err) {
      if (err instanceof ExecutionError) throw err;
      throw new ExecutionError(
        `Solana memo submit failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Build MPP-flavored Payment token: base64(JSON) carrying the signed-tx
    // signature, payer, and memo. Real mppx servers expect an HMAC token —
    // see file-level doc.
    const paymentToken = {
      scheme: "solana",
      network: detection.network,
      signature,
      memo: memoText,
      payer: keypair.publicKey.toBase58(),
      amount: detection.priceRaw,
      currency: detection.currency,
      recipient: detection.payTo,
    };
    const authValue =
      "Payment " + Buffer.from(JSON.stringify(paymentToken), "utf-8").toString("base64");

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          ...(options.headers ?? {}),
          Authorization: authValue,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      throw new ExecutionError(
        `Resource retry after payment failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new ExecutionError(
        `Resource rejected paid request: ${response.status} ${response.statusText}. Signature ${signature} was submitted on-chain.`,
        response.status,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("json") ? await response.json() : await response.text();

    const protocolReceipt =
      response.headers.get("payment-receipt") ??
      response.headers.get("x-payment-receipt") ??
      signature;

    return {
      success: true,
      data,
      txHash: signature,
      protocolReceipt,
      response,
    };
  },
};

function isSolanaNetwork(network: string): boolean {
  return network.startsWith("solana") || network === "devnet" || network === "localnet" || network === "mainnet-beta";
}

function resolveRpcUrl(network: string): string {
  if (network === "solana-mainnet" || network === "mainnet-beta") return "https://api.mainnet-beta.solana.com";
  return "https://api.devnet.solana.com";
}

function buildMemoText(detection: DetectionResult, url: string): string {
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url.slice(0, 32);
    }
  })();
  return [
    "rhemify",
    "mpp",
    detection.network,
    detection.priceRaw,
    detection.payTo,
    path,
    Date.now().toString(),
  ].join(":");
}
