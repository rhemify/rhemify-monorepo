import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import { decodeSolanaKey } from "../utils/keys.js";
import type { PaymentExecutor } from "./types.js";

/**
 * MPP one-shot charge executor for Solana.
 * Uses @solana/mpp (Solana Foundation SDK) via dynamic import.
 * The mppx client handles the full 402 challenge → sign → retry flow.
 */
export const mppChargeExecutor: PaymentExecutor = {
  protocol: "mpp",
  networks: ["solana-mainnet", "solana-devnet", "devnet", "localnet", "mainnet-beta"],

  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean {
    return detection.protocol === "mpp" && !!wallet.solanaPrivateKey;
  },

  async execute(
    url: string,
    _detection: DetectionResult,
    wallet: WalletConfig,
    options: PayOptions,
  ): Promise<ExecutionResult> {
    if (!wallet.solanaPrivateKey) {
      throw new NoWalletError("solana");
    }

    // Dynamic import of @solana/mpp client — all peer deps optional
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mppClient: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let solanaKit: any;

    try {
      mppClient = await import("@solana/mpp/client");
    } catch {
      throw new ExecutionError(
        "@solana/mpp is not installed. Run: bun add @solana/mpp mppx @solana/kit",
      );
    }

    try {
      solanaKit = await import("@solana/kit");
    } catch {
      throw new ExecutionError("@solana/kit is not installed. Run: bun add @solana/kit");
    }

    // Build signer from private key
    let signer: unknown;
    try {
      const keyBytes = decodeSolanaKey(wallet.solanaPrivateKey);
      // @solana/kit provides createKeyPairSignerFromBytes or equivalent
      if (solanaKit.createKeyPairSignerFromBytes) {
        signer = await solanaKit.createKeyPairSignerFromBytes(keyBytes);
      } else if (solanaKit.createKeyPairFromBytes) {
        const keyPair = await solanaKit.createKeyPairFromBytes(keyBytes);
        signer = await solanaKit.createSignerFromKeyPair(keyPair);
      } else {
        throw new Error("Cannot create signer — @solana/kit API not recognized");
      }
    } catch (err) {
      if (err instanceof ExecutionError) throw err;
      throw new ExecutionError(
        `Failed to create Solana signer: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      const method = mppClient.solana.charge({ signer });
      const mppx = mppClient.Mppx.create({ methods: [method] }) as { fetch: typeof fetch };

      // mppx.fetch handles the full 402 → sign → retry loop
      const response = await mppx.fetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        throw new ExecutionError(
          `MPP payment request failed: ${response.status} ${response.statusText}`,
          response.status,
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("json") ? await response.json() : await response.text();

      const txHash =
        response.headers.get("payment-receipt") ??
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
        `MPP charge failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};
