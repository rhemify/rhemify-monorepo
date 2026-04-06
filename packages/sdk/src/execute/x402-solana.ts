import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import type { PaymentExecutor } from "./types.js";

/**
 * x402 executor for Solana.
 * Uses the `x402-solana` npm package (peer dep) via dynamic import.
 * Wraps its fetch-with-payment into our ExecutionResult format.
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

    // Dynamic import — fails gracefully if peer dep not installed
    let x402Solana: {
      payWithSolana: (
        url: string,
        options: {
          privateKey: string;
          network?: string;
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        },
      ) => Promise<Response>;
    };

    try {
      // @ts-expect-error -- optional peer dep, may not be installed
      x402Solana = await import("x402-solana");
    } catch {
      throw new ExecutionError(
        'x402-solana is not installed. Run: bun add x402-solana',
      );
    }

    try {
      const response = await x402Solana.payWithSolana(url, {
        privateKey: wallet.solanaPrivateKey,
        network: detection.network,
        method: options.method,
        headers: options.headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        throw new ExecutionError(
          `Payment request failed: ${response.status} ${response.statusText}`,
          response.status,
        );
      }

      // Parse response
      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("json")
        ? await response.json()
        : await response.text();

      // Extract receipt from headers
      const txHash =
        response.headers.get("x-payment-receipt") ??
        response.headers.get("x-transaction-hash") ??
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
