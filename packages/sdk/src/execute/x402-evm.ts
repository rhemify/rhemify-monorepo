import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import type { PaymentExecutor } from "./types.js";

/**
 * x402 executor for EVM chains (Base, Ethereum, Arbitrum, etc.).
 * Uses the `x402-fetch` npm package (peer dep) via dynamic import.
 * wrapFetchWithPayment(fetch, walletClient, maxValue) returns a fetch
 * function that handles the full 402 → sign → pay → retry loop.
 */
export const x402EvmExecutor: PaymentExecutor = {
  protocol: "x402",
  networks: ["base", "base-sepolia", "ethereum", "arbitrum", "optimism"],

  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean {
    return (
      detection.protocol === "x402" && isEvmNetwork(detection.network) && !!wallet.evmPrivateKey
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let x402Fetch: any;

    try {
      // @ts-expect-error -- optional peer dep, may not be installed
      x402Fetch = await import("x402-fetch");
    } catch {
      throw new ExecutionError("x402-fetch is not installed. Run: bun add x402-fetch");
    }

    try {
      // x402-fetch API: createSigner(network, privateKey) → walletClient
      // wrapFetchWithPayment(fetch, walletClient, maxValue) → paymentFetch
      const signer = await x402Fetch.createSigner(
        detection.network,
        wallet.evmPrivateKey,
      );

      const maxValue = BigInt(detection.priceRaw) * 2n; // 2x buffer for safety
      const paymentFetch = x402Fetch.wrapFetchWithPayment(
        globalThis.fetch,
        signer,
        maxValue,
      );

      const response = await paymentFetch(url, {
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
      const data = contentType.includes("json") ? await response.json() : await response.text();

      // x402 v2 uses payment-response header for settlement receipt
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
        `x402 EVM payment failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};

function isEvmNetwork(network: string): boolean {
  const evmNetworks = ["base", "base-sepolia", "ethereum", "arbitrum", "optimism"];
  return evmNetworks.includes(network) || network.startsWith("eip155:");
}
