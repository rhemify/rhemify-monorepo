import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import { decodeSolanaKey } from "../utils/keys.js";
import type { PaymentExecutor } from "./types.js";

/**
 * x402 executor for Solana.
 *
 * Self-contained: anchors a memo transaction on Solana for each payment,
 * encoding the trace context (resource, amount, recipient, timestamp) into
 * the memo payload. The signed-and-submitted tx is then attached to the
 * upstream HTTP request as the X-Payment header in the x402-spec PaymentPayload
 * shape, so the resource gets a verifiable on-chain proof of payment intent
 * for the request it just served a 402 to.
 *
 * This deliberately does NOT call out to the `x402-solana` npm package — that
 * package was a peer dep declared but not installed, and using it as the
 * happy path silently broke every real run. The memo path is honest about
 * what it does:
 *
 *   - It produces a real Solana signature on the cluster the wallet is on
 *     (devnet here, mainnet when configured), pageable on any explorer.
 *   - It is NOT a USDC SPL-Token transfer — no funds move to the recipient.
 *     A future executor variant (`x402SolanaTransferExecutor`) should do the
 *     real token transfer for production use; for the audit-grade demo, the
 *     memo serves as cryptographic intent + payable trace anchor.
 *   - The PaymentPayload it sends is x402-spec-shaped (x402Version=2, scheme,
 *     network, payload.transaction) so a real facilitator endpoint could read
 *     it — the local test server accepts any header.
 */

interface Web3Connection {
  // Minimal type surface we use. Real instance comes from @solana/web3.js.
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

export const x402SolanaExecutor: PaymentExecutor = {
  protocol: "x402",
  networks: ["solana-mainnet", "solana-devnet", "solana"],

  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean {
    return (
      detection.protocol === "x402" &&
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

    // Build x402-spec PaymentPayload and base64 it for the X-Payment header.
    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: detection.network,
      payload: {
        transaction: signature,
        memo: memoText,
        payer: keypair.publicKey.toBase58(),
      },
    };
    const xPaymentHeader = Buffer.from(JSON.stringify(paymentPayload), "utf-8").toString("base64");

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          ...(options.headers ?? {}),
          "X-Payment": xPaymentHeader,
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
      response.headers.get("payment-response") ??
      response.headers.get("x-payment-response") ??
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
  return network.startsWith("solana") || network === "devnet" || network === "localnet";
}

function resolveRpcUrl(network: string): string {
  if (network === "solana-mainnet" || network === "solana") return "https://api.mainnet-beta.solana.com";
  return "https://api.devnet.solana.com";
}

function buildMemoText(detection: DetectionResult, url: string): string {
  // Bound to 566 bytes (SPL memo v2 max), but we keep it short anyway —
  // each byte costs rent + bytecode space at submit time.
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url.slice(0, 32);
    }
  })();
  return [
    "rhemify",
    "x402",
    detection.network,
    detection.priceRaw,
    detection.payTo,
    path,
    Date.now().toString(),
  ].join(":");
}
