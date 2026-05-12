import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import { decodeSolanaKey } from "../utils/keys.js";
import type { PaymentExecutor } from "./types.js";

/**
 * MPP SPL-Token transfer executor for Solana.
 *
 * Real settlement variant of mppChargeExecutor, mirroring
 * x402SolanaTransferExecutor for the MPP standard. Moves actual USDC
 * from the payer's ATA to the recipient's instead of signing a memo.
 *
 * Cascade ordering for MPP:
 *   1. mppChargeTransferExecutor (this one — real USDC)
 *   2. mppChargeExecutor          (memo fallback — proves intent)
 *
 * Same fall-through semantics as the x402 pair: canExecute or execute()
 * failure routes the cascade to the memo executor; demo always succeeds.
 *
 * Differences from x402SolanaTransferExecutor (besides protocol filter):
 *   - Outgoing header is `Authorization: Payment <base64>` (MPP
 *     convention) instead of `X-Payment: <base64>` (x402 convention).
 *   - PaymentPayload shape mirrors mppChargeExecutor (scheme=solana,
 *     no x402Version) so a downstream mppx-style server sees a familiar
 *     payload shape.
 *
 * Everything else — ATA derivation, TransferChecked discriminator,
 * idempotent ATA creation, USDC mint constants — is identical.
 */

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_IX_TRANSFER_CHECKED = 12;
const ATA_IX_CREATE_IDEMPOTENT = 1;
const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;

interface Web3Connection {
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  sendRawTransaction(rawTx: Buffer | Uint8Array): Promise<string>;
  confirmTransaction(
    strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
    commitment?: string,
  ): Promise<{ value: { err: unknown } }>;
  getAccountInfo(pubkey: unknown): Promise<{ owner: unknown } | null>;
}

interface SolanaPublicKey {
  toBase58(): string;
  toBuffer(): Buffer;
}

interface SolanaWeb3 {
  Connection: new (endpoint: string, commitment: string) => Web3Connection;
  Keypair: {
    fromSecretKey(bytes: Uint8Array): { publicKey: SolanaPublicKey; secretKey: Uint8Array };
  };
  PublicKey: {
    new (key: string | Buffer | Uint8Array): SolanaPublicKey;
    findProgramAddressSync(seeds: (Buffer | Uint8Array)[], programId: SolanaPublicKey): [SolanaPublicKey, number];
  };
  Transaction: new () => {
    add(...ixs: unknown[]): unknown;
    recentBlockhash: string;
    feePayer: SolanaPublicKey;
    sign(...signers: unknown[]): void;
    serialize(): Buffer;
  };
  TransactionInstruction: new (opts: {
    keys: { pubkey: SolanaPublicKey; isSigner: boolean; isWritable: boolean }[];
    programId: SolanaPublicKey;
    data: Buffer;
  }) => unknown;
}

export const mppChargeTransferExecutor: PaymentExecutor = {
  protocol: "mpp",
  networks: ["solana-mainnet", "solana-devnet", "devnet", "localnet", "mainnet-beta"],

  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean {
    if (detection.protocol !== "mpp") return false;
    if (!isSolanaNetwork(detection.network)) return false;
    if (!wallet.solanaPrivateKey) return false;
    if (!isValidPayToForTransfer(detection.payTo)) return false;
    return true;
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
    const mintAddress = resolveUsdcMint(detection.network);
    const connection = new web3.Connection(rpcUrl, "confirmed");
    const keyBytes = decodeSolanaKey(wallet.solanaPrivateKey);
    const payer = web3.Keypair.fromSecretKey(keyBytes);
    const payerPubkey = payer.publicKey;
    const recipientPubkey = new web3.PublicKey(detection.payTo);
    const mint = new web3.PublicKey(mintAddress);

    const tokenProgram = new web3.PublicKey(TOKEN_PROGRAM_ID);
    const ataProgram = new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
    const systemProgram = new web3.PublicKey(SYSTEM_PROGRAM_ID);

    const [sourceAta] = web3.PublicKey.findProgramAddressSync(
      [payerPubkey.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      ataProgram,
    );
    const [destAta] = web3.PublicKey.findProgramAddressSync(
      [recipientPubkey.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      ataProgram,
    );

    const sourceInfo = await connection.getAccountInfo(sourceAta);
    if (!sourceInfo) {
      throw new ExecutionError(
        `Payer has no USDC associated token account on ${detection.network}. ` +
          `Fund the payer (${payerPubkey.toBase58()}) with devnet USDC via ` +
          `faucet.circle.com and retry.`,
      );
    }

    const ixs: unknown[] = [];

    const destInfo = await connection.getAccountInfo(destAta);
    if (!destInfo) {
      const createIxData = Buffer.from([ATA_IX_CREATE_IDEMPOTENT]);
      ixs.push(
        new web3.TransactionInstruction({
          keys: [
            { pubkey: payerPubkey, isSigner: true, isWritable: true },
            { pubkey: destAta, isSigner: false, isWritable: true },
            { pubkey: recipientPubkey, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: systemProgram, isSigner: false, isWritable: false },
            { pubkey: tokenProgram, isSigner: false, isWritable: false },
          ],
          programId: ataProgram,
          data: createIxData,
        }),
      );
    }

    const amountRaw = BigInt(detection.priceRaw);
    const transferData = Buffer.alloc(1 + 8 + 1);
    transferData.writeUInt8(TOKEN_IX_TRANSFER_CHECKED, 0);
    transferData.writeBigUInt64LE(amountRaw, 1);
    transferData.writeUInt8(USDC_DECIMALS, 9);

    ixs.push(
      new web3.TransactionInstruction({
        keys: [
          { pubkey: sourceAta, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: destAta, isSigner: false, isWritable: true },
          { pubkey: payerPubkey, isSigner: true, isWritable: false },
        ],
        programId: tokenProgram,
        data: transferData,
      }),
    );

    let signature: string;
    try {
      const tx = new web3.Transaction();
      for (const ix of ixs) tx.add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = payerPubkey;
      tx.sign(payer);

      const rawTx = tx.serialize();
      signature = await connection.sendRawTransaction(rawTx);
      const conf = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      if (conf.value.err) {
        throw new ExecutionError(`USDC transfer failed: ${JSON.stringify(conf.value.err)}`);
      }
    } catch (err) {
      if (err instanceof ExecutionError) throw err;
      throw new ExecutionError(
        `USDC transfer submit failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // MPP-flavored Payment token. Same kind="spl-token-transfer" marker
    // as the x402 transfer executor so a downstream parser can route on
    // settlement-vs-intent regardless of which standard the 402 used.
    const paymentToken = {
      scheme: "solana",
      network: detection.network,
      signature,
      kind: "spl-token-transfer",
      mint: mintAddress,
      amount: detection.priceRaw,
      currency: detection.currency,
      payer: payerPubkey.toBase58(),
      recipient: recipientPubkey.toBase58(),
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
        `Resource retry after USDC transfer failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new ExecutionError(
        `Resource rejected paid request: ${response.status} ${response.statusText}. ` +
          `USDC transfer ${signature} was already submitted on-chain — funds have moved.`,
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
  return (
    network.startsWith("solana") ||
    network === "devnet" ||
    network === "localnet" ||
    network === "mainnet-beta"
  );
}

function resolveRpcUrl(network: string): string {
  if (network === "solana-mainnet" || network === "mainnet-beta") {
    return "https://api.mainnet-beta.solana.com";
  }
  return "https://api.devnet.solana.com";
}

function resolveUsdcMint(network: string): string {
  if (network === "solana-mainnet" || network === "mainnet-beta") return MAINNET_USDC_MINT;
  return DEVNET_USDC_MINT;
}

function isValidPayToForTransfer(payTo: string): boolean {
  if (!payTo || payTo === SYSTEM_PROGRAM_ID) return false;
  if (payTo.length < 32 || payTo.length > 44) return false;
  return true;
}
