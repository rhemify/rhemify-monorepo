import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import type { PaymentExecutor } from "./types.js";

/**
 * x402 executor for EVM chains (Base, Ethereum, Arbitrum, etc.).
 * Uses the `x402-fetch` npm package (peer dep) via dynamic import.
 */
export const x402EvmExecutor: PaymentExecutor = {
  protocol: "x402",
  networks: ["base", "base-sepolia", "ethereum", "arbitrum", "optimism"],

  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean {
    return (
      detection.protocol === "x402" &&
      isEvmNetwork(detection.network) &&
      !!wallet.evmPrivateKey
    );
  },

  async execute(
    url: string,
    detection: DetectionResult,
    wallet: WalletConfig,
    options: PayOptions,
  ): Promise<ExecutionResult> {
    if (!wallet.evmPrivateKey) {
      throw new NoWalletError("evm");
    }

    let x402Fetch: {
      payWithFetch: (
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
      x402Fetch = await import("x402-fetch");
    } catch {
      throw new ExecutionError(
        'x402-fetch is not installed. Run: bun add x402-fetch',
      );
    }

    try {
      const response = await x402Fetch.payWithFetch(url, {
        privateKey: wallet.evmPrivateKey,
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

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("json")
        ? await response.json()
        : await response.text();

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
        `x402 EVM payment failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};

function isEvmNetwork(network: string): boolean {
  const evmNetworks = ["base", "base-sepolia", "ethereum", "arbitrum", "optimism"];
  return evmNetworks.includes(network) || network.startsWith("eip155:");
}
