import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import type { PaymentExecutor } from "./types.js";

/**
 * MPP session (streaming) executor for Solana.
 * Uses @solana/mpp session method for cumulative voucher signing.
 *
 * Note: This executor is used for individual requests within a session.
 * The session lifecycle (open/close/topup) is managed by the Rhemify
 * session() wrapper in client.ts.
 *
 * For now this is a stub — session execution requires a pre-opened
 * mppx session instance which is managed at a higher level.
 */
export const mppSessionExecutor: PaymentExecutor = {
  protocol: "mpp",
  networks: ["solana-mainnet", "solana-devnet", "devnet", "localnet", "mainnet-beta"],

  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean {
    // Session executor is only used when explicitly selected by session() wrapper
    // For regular pay() calls, mppChargeExecutor handles MPP
    return false && detection.protocol === "mpp" && !!wallet.solanaPrivateKey;
  },

  async execute(
    _url: string,
    _detection: DetectionResult,
    wallet: WalletConfig,
    _options: PayOptions,
  ): Promise<ExecutionResult> {
    if (!wallet.solanaPrivateKey) {
      throw new NoWalletError("solana");
    }

    // Session execution is managed by the session() wrapper
    // This executor should not be called directly in pay()
    throw new ExecutionError(
      "MPP session executor should not be called directly. Use rhemify.session() instead.",
    );
  },
};
