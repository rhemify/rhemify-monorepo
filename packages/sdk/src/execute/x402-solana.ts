import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import { decodeSolanaKey } from "../utils/keys.js";
import type { PaymentExecutor } from "./types.js";

/**
 * x402 executor for Solana.
 * Uses the `x402-solana` npm package (peer dep) via dynamic import.
 * createX402Client({ wallet, network }) returns a client whose .fetch()
 * handles the full 402 → sign → pay → retry loop automatically.
 *
 * x402-solana expects a wallet adapter object with:
 *   - publicKey (PublicKey instance)
 *   - signTransaction(tx) → signed tx
 */
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let x402Solana: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let web3: any;

    try {
      // @ts-expect-error -- optional peer dep, may not be installed
      x402Solana = await import("x402-solana");
    } catch {
      throw new ExecutionError(
        'x402-solana is not installed. Run: bun add x402-solana',
      );
    }

    try {
      // @ts-expect-error -- dependency of the SDK
      web3 = await import("@solana/web3.js");
    } catch {
      throw new ExecutionError(
        '@solana/web3.js is not installed. Run: bun add @solana/web3.js',
      );
    }

    try {
      // Build a wallet adapter from the private key
      const keyBytes = decodeSolanaKey(wallet.solanaPrivateKey);
      const keypair = web3.Keypair.fromSecretKey(keyBytes);

      // x402-solana expects { publicKey, signTransaction }
      const walletAdapter = {
        publicKey: keypair.publicKey,
        signTransaction: async (tx: { sign: (signers: unknown[]) => void }) => {
          tx.sign([keypair]);
          return tx;
        },
      };

      const client = x402Solana.createX402Client({
        wallet: walletAdapter,
        network: detection.network === "solana-devnet" ? "solana-devnet" : "solana-mainnet",
      });

      const response = await client.fetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        throw new ExecutionError(
          `Payment request failed: ${response.status} ${response.statusText}`,
          response.status,
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("json")
        ? await response.json()
        : await response.text();

      const txHash =
        response.headers.get("payment-response") ??
        response.headers.get("x-payment-response") ??
        response.headers.get("x-payment-receipt") ??
        undefined;

      return {
        success: true,
        data,
        txHash,
        protocolReceipt: txHash,
        response,
      };
    } catch (err) {
      if (err instanceof ExecutionError) throw err;
      throw new ExecutionError(
        `x402 Solana payment failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};

function isSolanaNetwork(network: string): boolean {
  return network.startsWith("solana") || network === "devnet" || network === "localnet";
}
