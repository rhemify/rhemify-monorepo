import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import { decodeSolanaKey } from "../utils/keys.js";
import type { PaymentExecutor } from "./types.js";

// Well-known Solana SPL token mints (mainnet only — Jupiter does not support devnet)
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112"; // Wrapped SOL

const JUPITER_API = "https://api.jup.ag/swap/v2";

// Module-level API key — set by client factory
let jupiterApiKey: string | undefined;

export function setJupiterApiKey(key: string | undefined) {
  jupiterApiKey = key;
}

/**
 * Jupiter swap executor for Solana (mainnet only).
 * Uses Jupiter Swap V2 API: GET /order → sign → POST /execute.
 * Jupiter handles broadcasting, confirmation, retries, and MEV protection.
 *
 * Swaps the agent's held token to the vendor's required token,
 * then delegates to the x402 Solana executor for the actual payment.
 *
 * Only activates when there's a token mismatch on Solana mainnet.
 */
export const jupiterSwapExecutor: PaymentExecutor = {
  protocol: "x402",
  networks: ["solana-mainnet", "mainnet-beta"],

  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean {
    return (
      detection.protocol === "x402" &&
      isMainnetSolana(detection.network) &&
      !!wallet.solanaPrivateKey &&
      !!jupiterApiKey &&
      detection.currency !== "USDC"
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
    if (!jupiterApiKey) {
      throw new ExecutionError("Jupiter API key not configured. Get one at developers.jup.ag");
    }

    interface SolanaWeb3 {
      Keypair: { fromSecretKey(bytes: Uint8Array): { publicKey: { toString(): string }; sign(signers: unknown[]): void } };
      VersionedTransaction: { deserialize(bytes: Uint8Array): { sign(signers: unknown[]): void; serialize(): Uint8Array } };
    }
    let web3: SolanaWeb3;
    try {
      web3 = (await import("@solana/web3.js")) as unknown as SolanaWeb3;
    } catch {
      throw new ExecutionError("@solana/web3.js is not installed");
    }

    const keyBytes = decodeSolanaKey(wallet.solanaPrivateKey);
    const keypair = web3.Keypair.fromSecretKey(keyBytes);

    const inputMint = USDC_MAINNET; // Agent holds USDC
    const outputMint = resolveOutputMint(detection);
    const amount = String(detection.priceRaw);

    try {
      // Step 1: Get order (quote + assembled transaction in one call)
      const orderUrl = new URL(`${JUPITER_API}/order`);
      orderUrl.searchParams.set("inputMint", inputMint);
      orderUrl.searchParams.set("outputMint", outputMint);
      orderUrl.searchParams.set("amount", amount);
      orderUrl.searchParams.set("taker", keypair.publicKey.toString());
      orderUrl.searchParams.set("slippageBps", "50");

      const orderRes = await fetch(orderUrl.toString(), {
        headers: { "x-api-key": jupiterApiKey },
      });

      if (!orderRes.ok) {
        const errText = await orderRes.text().catch(() => "");
        throw new ExecutionError(
          `Jupiter /order failed: ${orderRes.status} ${errText}`,
        );
      }

      const order = await orderRes.json();

      if (!order.transaction || !order.requestId) {
        throw new ExecutionError(
          `Jupiter /order returned incomplete response: ${JSON.stringify(order).slice(0, 200)}`,
        );
      }

      // Step 2: Sign the transaction
      const txBuf = Buffer.from(order.transaction, "base64");
      const tx = web3.VersionedTransaction.deserialize(txBuf);
      tx.sign([keypair]);

      const signedTransaction = Buffer.from(tx.serialize()).toString("base64");

      // Step 3: Execute via Jupiter (managed broadcasting + confirmation)
      const execRes = await fetch(`${JUPITER_API}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": jupiterApiKey,
        },
        body: JSON.stringify({
          signedTransaction,
          requestId: order.requestId,
        }),
      });

      if (!execRes.ok) {
        const errText = await execRes.text().catch(() => "");
        throw new ExecutionError(
          `Jupiter /execute failed: ${execRes.status} ${errText}`,
        );
      }

      const execResult = await execRes.json();

      if (execResult.status === "Failed") {
        throw new ExecutionError(
          `Jupiter swap failed: ${execResult.error ?? "unknown"} (code: ${execResult.code})`,
        );
      }

      // Step 4: Delegate to x402 Solana executor for the actual payment
      const { x402SolanaExecutor } = await import("./x402-solana.js");
      const payResult = await x402SolanaExecutor.execute(url, detection, wallet, options);

      return {
        ...payResult,
        txHash: payResult.txHash ?? execResult.signature,
        protocolReceipt: {
          swapSignature: execResult.signature,
          swapSlot: execResult.slot,
          inputAmountResult: execResult.inputAmountResult,
          outputAmountResult: execResult.outputAmountResult,
          paymentTxHash: payResult.txHash,
          quote: {
            inputMint,
            outputMint,
            inAmount: order.inAmount,
            outAmount: order.outAmount,
            router: order.router,
            priceImpact: order.priceImpact,
          },
        },
      };
    } catch (err) {
      if (err instanceof ExecutionError) throw err;
      throw new ExecutionError(
        `Jupiter swap + pay failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};

function isMainnetSolana(network: string): boolean {
  return network === "solana-mainnet" || network === "mainnet-beta";
}

function resolveOutputMint(detection: DetectionResult): string {
  // If the vendor specifies an asset mint in the detection, use it
  const raw = detection.raw.body as Record<string, unknown> | undefined;
  if (raw?.asset && typeof raw.asset === "string") return raw.asset;

  // Fallback: map common currency names to mints
  switch (detection.currency?.toUpperCase()) {
    case "SOL":
    case "WSOL":
      return SOL_MINT;
    default:
      return SOL_MINT;
  }
}
