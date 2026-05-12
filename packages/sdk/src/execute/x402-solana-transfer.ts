import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import { decodeSolanaKey } from "../utils/keys.js";
import type { PaymentExecutor } from "./types.js";

/**
 * x402 SPL-Token transfer executor for Solana.
 *
 * Real settlement variant of x402SolanaExecutor. Where the memo executor
 * proves *intent* (a signed-on-chain tx whose memo payload carries trace
 * context), this one actually moves USDC from the payer's associated
 * token account to the recipient's. Settlement, not just intent.
 *
 * Cascade ordering:
 *   1. x402SolanaTransferExecutor (this one — real USDC)
 *   2. x402SolanaExecutor          (memo fallback — proves intent)
 *
 * If this executor's canExecute returns false, or its execute() throws
 * (no USDC ATA, insufficient balance, malformed recipient, etc.), the
 * cascade falls through to the memo executor. The demo always succeeds;
 * production callers get the real settlement when their wallet is funded.
 *
 * canExecute requirements:
 *   - protocol = x402
 *   - Solana network
 *   - wallet has solanaPrivateKey
 *   - detection.payTo is a valid base58 pubkey AND NOT the System Program
 *     (System Program "1111...1" can't hold SPL tokens — test 402 server
 *     uses it as a placeholder when no real recipient is configured)
 *
 * Devnet USDC mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
 * Mainnet USDC mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
 *
 * Honest scope: only USDC transfers. Other tokens (USDT, custom mints)
 * would need either dynamic mint discovery from the 402 response or a
 * separate executor variant.
 */

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

// SPL Token instruction discriminators (single byte).
const TOKEN_IX_TRANSFER_CHECKED = 12;

// Associated Token Account instruction discriminators.
const ATA_IX_CREATE_IDEMPOTENT = 1;

const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface Web3Connection {
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  sendRawTransaction(rawTx: Buffer | Uint8Array): Promise<string>;
  confirmTransaction(
    strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
    commitment?: string,
  ): Promise<{ value: { err: unknown } }>;
  getAccountInfo(pubkey: unknown): Promise<{ owner: unknown; data: Buffer } | null>;
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
    partialSign(...signers: unknown[]): void;
    serialize(options?: { requireAllSignatures?: boolean; verifySignatures?: boolean }): Buffer;
  };
  TransactionInstruction: new (opts: {
    keys: { pubkey: SolanaPublicKey; isSigner: boolean; isWritable: boolean }[];
    programId: SolanaPublicKey;
    data: Buffer;
  }) => unknown;
  TransactionMessage: new (opts: {
    payerKey: SolanaPublicKey;
    recentBlockhash: string;
    instructions: unknown[];
  }) => { compileToV0Message(): unknown };
  VersionedTransaction: new (message: unknown) => {
    sign(signers: { secretKey: Uint8Array }[]): void;
    serialize(): Uint8Array;
  };
  ComputeBudgetProgram: {
    setComputeUnitLimit(opts: { units: number }): unknown;
    setComputeUnitPrice(opts: { microLamports: number | bigint }): unknown;
  };
}

// @x402/svm canonical defaults — facilitator's verify rejects txs whose
// position-0 = ComputeUnitLimit and position-1 = ComputeUnitPrice ixs don't
// parse cleanly. Match values used by the reference client (1 µL/CU, 20k CU).
const DEFAULT_COMPUTE_UNIT_LIMIT = 20000;
const DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS = 1;
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const MAX_MEMO_BYTES = 256;

export const x402SolanaTransferExecutor: PaymentExecutor = {
  protocol: "x402",
  networks: ["solana-mainnet", "solana-devnet", "solana"],

  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean {
    if (detection.protocol !== "x402") return false;
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
    const connection = new web3.Connection(rpcUrl, "confirmed");
    const keyBytes = decodeSolanaKey(wallet.solanaPrivateKey);
    const payer = web3.Keypair.fromSecretKey(keyBytes);
    const payerPubkey = payer.publicKey;
    const recipientPubkey = new web3.PublicKey(detection.payTo);

    // Facilitator mode: when the 402 specifies extra.feePayer, the resource
    // wants its facilitator to broadcast on its own gas after verifying our
    // partially-signed tx. Self mode: no facilitator → we broadcast.
    const facilitatorMode =
      !!detection.feePayer && detection.feePayer !== payerPubkey.toBase58();
    const feePayerKey = facilitatorMode
      ? new web3.PublicKey(detection.feePayer!)
      : payerPubkey;

    // Mint selection: canonical x402 SVM clients require `paymentRequirements.asset`
    // and throw if absent. In facilitator mode we mirror that strictness — the
    // facilitator's verify compares the on-chain mint against requirements.asset
    // byte-for-byte (invalid_exact_svm_payload_mint_mismatch). Falling back to a
    // hardcoded USDC mint in facilitator mode would just guarantee mismatch on
    // any non-USDC seller. In self mode we keep the USDC fallback because the
    // self-broadcast path is only used by our own test-402 server which omits
    // `asset` for ergonomics.
    const mintAddress = detection.asset ?? (facilitatorMode ? null : resolveUsdcMint(detection.network));
    if (!mintAddress) {
      throw new ExecutionError(
        `x402 facilitator mode requires \`asset\` (SPL mint pubkey) in the 402 response; ` +
          `the resource at ${url} omitted it.`,
      );
    }
    const mint = new web3.PublicKey(mintAddress);

    const tokenProgram = new web3.PublicKey(TOKEN_PROGRAM_ID);
    const ataProgram = new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
    const systemProgram = new web3.PublicKey(SYSTEM_PROGRAM_ID);

    // Read decimals from the mint account instead of hardcoding USDC's 6.
    // Canonical @x402/svm fetches the mint via fetchMint(rpc, asset) and uses
    // tokenMint.data.decimals; we read the raw account bytes (decimals is at
    // offset 44 in the SPL Token mint layout). Hardcoding 6 would either get
    // rejected at facilitator verify (decimals byte in TransferChecked must
    // match the mint's actual decimals) or silently transfer a wrong-by-10^N
    // amount on non-USDC mints.
    const mintInfo = await connection.getAccountInfo(mint);
    if (!mintInfo) {
      throw new ExecutionError(
        `Mint ${mintAddress} not found on ${detection.network}. ` +
          `Check that the 402 response's \`asset\` field references a mint on the right cluster.`,
      );
    }
    const mintDecimals = mintInfo.data[44];
    if (typeof mintDecimals !== "number") {
      throw new ExecutionError(
        `Could not read decimals byte from mint ${mintAddress} account data`,
      );
    }

    // Derive source + destination ATAs. ATA seeds = [owner, TokenProgram, mint].
    const [sourceAta] = web3.PublicKey.findProgramAddressSync(
      [payerPubkey.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      ataProgram,
    );
    const [destAta] = web3.PublicKey.findProgramAddressSync(
      [recipientPubkey.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      ataProgram,
    );

    // Source ATA must exist + be owned by the SPL Token program. Failing
    // this is the "wallet not funded with USDC" path; the cascade picks
    // up x402SolanaExecutor (memo) downstream of our throw here.
    const sourceInfo = await connection.getAccountInfo(sourceAta);
    if (!sourceInfo) {
      throw new ExecutionError(
        `Payer has no USDC associated token account on ${detection.network}. ` +
          `Fund the payer (${payerPubkey.toBase58()}) with devnet USDC via ` +
          `faucet.circle.com (or jupiter swap on mainnet) and retry.`,
      );
    }

    const ixs: unknown[] = [];

    if (facilitatorMode) {
      // Facilitator's verify (@x402/svm exact/facilitator) requires positions
      // 0 = ComputeUnitLimit, 1 = ComputeUnitPrice, 2 = TransferChecked, and
      // rejects any prepended ix that isn't ComputeBudget — so we MUST NOT
      // prepend ATA-create here. If the recipient ATA is missing, the
      // facilitator either creates it or returns recipient_mismatch; either
      // way the cascade falls through to the memo executor. Don't break the
      // strict ordering by trying to be helpful.
      ixs.push(
        web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: DEFAULT_COMPUTE_UNIT_LIMIT,
        }),
        web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
        }),
      );
    } else {
      // Self-broadcast: if recipient ATA doesn't exist, prepend CreateIdempotent
      // so the transfer doesn't fail at runtime. Funder is the payer (who is
      // also tx.feePayer in self mode).
      const destInfo = await connection.getAccountInfo(destAta);
      if (!destInfo) {
        const createIxData = Buffer.from([ATA_IX_CREATE_IDEMPOTENT]);
        ixs.push(
          new web3.TransactionInstruction({
            keys: [
              { pubkey: feePayerKey, isSigner: true, isWritable: true },       // funder = feePayer
              { pubkey: destAta, isSigner: false, isWritable: true },          // ATA being created
              { pubkey: recipientPubkey, isSigner: false, isWritable: false }, // owner of ATA
              { pubkey: mint, isSigner: false, isWritable: false },
              { pubkey: systemProgram, isSigner: false, isWritable: false },
              { pubkey: tokenProgram, isSigner: false, isWritable: false },
            ],
            programId: ataProgram,
            data: createIxData,
          }),
        );
      }
    }

    // Token::TransferChecked — discriminator 12, takes amount (u64 LE) +
    // decimals (u8). TransferChecked verifies the mint matches, defending
    // against the multi-mint confusion attack vectors that plain Transfer
    // is vulnerable to.
    const amountRaw = BigInt(detection.priceRaw); // already in base units
    const transferData = Buffer.alloc(1 + 8 + 1);
    transferData.writeUInt8(TOKEN_IX_TRANSFER_CHECKED, 0);
    transferData.writeBigUInt64LE(amountRaw, 1);
    transferData.writeUInt8(mintDecimals, 9);

    ixs.push(
      new web3.TransactionInstruction({
        keys: [
          { pubkey: sourceAta, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: destAta, isSigner: false, isWritable: true },
          { pubkey: payerPubkey, isSigner: true, isWritable: false }, // owner
        ],
        programId: tokenProgram,
        data: transferData,
      }),
    );

    if (facilitatorMode) {
      // Append a Memo ix per @x402/svm exact/client/scheme.ts. If the seller
      // pre-declared a memo string in 402.extra.memo, use those bytes verbatim
      // — facilitator's verify will compare byte-for-byte and reject on
      // mismatch (invalid_exact_svm_payload_memo_mismatch). Otherwise use a
      // 16-byte random nonce as hex, matching the canonical client's default
      // nonce shape for tx-uniqueness / replay safety.
      const memoBytes = (() => {
        if (detection.memo) {
          const provided = Buffer.from(detection.memo, "utf-8");
          if (provided.byteLength > MAX_MEMO_BYTES) {
            throw new ExecutionError(
              `extra.memo from 402 response exceeds ${MAX_MEMO_BYTES} bytes (${provided.byteLength}); refusing to truncate`,
            );
          }
          return provided;
        }
        const nonce = new Uint8Array(16);
        globalThis.crypto.getRandomValues(nonce);
        const hex = Array.from(nonce, (b) => b.toString(16).padStart(2, "0")).join("");
        return Buffer.from(hex, "utf-8");
      })();
      ixs.push(
        new web3.TransactionInstruction({
          keys: [],
          programId: new web3.PublicKey(MEMO_PROGRAM_ID),
          data: memoBytes,
        }),
      );
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    let signature: string;

    if (facilitatorMode) {
      // v2 facilitator-broadcast flow. Empirically verified against x402.org
      // (HTTP 200, payment-response header carrying the facilitator's settle
      // tx sig, 0.01 USDC moved by the facilitator on its own gas):
      //
      //   1. v0 VersionedTransaction with feePayer = facilitator pubkey
      //   2. Sign with payer only (the TransferChecked.authority); feePayer
      //      slot stays empty for the facilitator to fill in
      //   3. PaymentPayload shape `{ x402Version: 2, accepted: <full
      //      PaymentRequirements>, payload: { transaction: base64WireBytes } }`
      //      — `accepted` carries the requirement strings the server matches
      //      against in findMatchingRequirements; `scheme`/`network` at top
      //      level (legacy v1 shape) gets rejected as "no matching requirements"
      //   4. Wire header is `PAYMENT-SIGNATURE` for v2 (NOT `X-Payment` —
      //      that's the v1 header name; v2 servers ignore it). See
      //      @x402/core http/x402HTTPClient.ts:encodePaymentSignatureHeader.
      const message = new web3.TransactionMessage({
        payerKey: feePayerKey,
        recentBlockhash: blockhash,
        instructions: ixs,
      }).compileToV0Message();
      const vtx = new web3.VersionedTransaction(message);
      try {
        vtx.sign([payer]);
      } catch (err) {
        throw new ExecutionError(
          `partial sign failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const txBase64 = Buffer.from(vtx.serialize()).toString("base64");

      const acceptedRequirement = {
        scheme: "exact",
        network: toCaipNetwork(detection.network),
        amount: String(detection.priceRaw),
        asset: mintAddress,
        payTo: detection.payTo,
        // Server-advertised default in `accepts[]`; canonical clients
        // echo this from the matched accept entry.
        maxTimeoutSeconds: 300,
        extra: { feePayer: detection.feePayer },
      };
      const paymentPayload = {
        x402Version: 2,
        accepted: acceptedRequirement,
        payload: { transaction: txBase64 },
      };
      const signatureHeader = Buffer.from(JSON.stringify(paymentPayload), "utf-8").toString(
        "base64",
      );

      let response: Response;
      try {
        response = await fetch(url, {
          method: options.method ?? "GET",
          headers: {
            ...(options.headers ?? {}),
            "PAYMENT-SIGNATURE": signatureHeader,
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
      } catch (err) {
        throw new ExecutionError(
          `Resource retry (facilitator mode) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!response.ok) {
        throw new ExecutionError(
          `Resource rejected facilitator-mode payment: ${response.status} ${response.statusText}. ` +
            `Tx was partial-signed for facilitator ${detection.feePayer} but NOT broadcast — funds DID NOT move on-chain.`,
          response.status,
        );
      }

      signature =
        extractSettlementSignature(response) ??
        "(facilitator broadcast; no signature surfaced in payment-response header)";

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("json") ? await response.json() : await response.text();
      return {
        success: true,
        data,
        txHash: signature,
        protocolReceipt: signature,
        response,
      };
    }

    // Self-broadcast mode — original code path for resources that don't run
    // a facilitator (our local test-402 server, simple direct-pay endpoints).
    // Uses legacy Transaction for backwards compat with the existing
    // test-402 server, which accepts both wire formats.
    const tx = new web3.Transaction();
    for (const ix of ixs) tx.add(ix);
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayerKey;
    try {
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

    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: detection.network,
      payload: {
        transaction: signature,
        kind: "spl-token-transfer",
        mint: mintAddress,
        amount: detection.priceRaw,
        payer: payerPubkey.toBase58(),
        recipient: recipientPubkey.toBase58(),
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

function resolveUsdcMint(network: string): string {
  if (network === "solana-mainnet" || network === "solana") return MAINNET_USDC_MINT;
  return DEVNET_USDC_MINT;
}

function isValidPayToForTransfer(payTo: string): boolean {
  if (!payTo || payTo === SYSTEM_PROGRAM_ID) return false;
  if (payTo.length < 32 || payTo.length > 44) return false;
  return true;
}

/** Reverse map our normalized network names back to CAIP form. */
function toCaipNetwork(network: string): string {
  switch (network) {
    case "solana-mainnet":
    case "solana":
      return "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
    case "solana-devnet":
      return "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
    default:
      return network;
  }
}

/**
 * Extract the on-chain signature the facilitator broadcast. Per the x402
 * spec, settlement details come back in the `x-payment-response` header as
 * base64(JSON). Different facilitators put the sig under different keys —
 * try the common ones.
 */
function extractSettlementSignature(response: Response): string | null {
  const raw =
    response.headers.get("x-payment-response") ??
    response.headers.get("payment-response") ??
    response.headers.get("x-payment-receipt");
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    return (
      decoded?.payload?.transaction ??
      decoded?.transaction ??
      decoded?.signature ??
      decoded?.txHash ??
      null
    );
  } catch {
    return raw;
  }
}
