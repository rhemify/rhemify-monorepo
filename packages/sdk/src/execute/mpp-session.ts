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

  canExecute(_detection: DetectionResult, _wallet: WalletConfig): boolean {
    // Intentionally inert in the cascade. The session() wrapper in
    // src/session/index.ts calls this executor directly when an explicit
    // session is requested; for regular pay() calls, mppChargeExecutor
    // handles MPP. Returning false here ensures cascade never picks this
    // up implicitly — it must be selected explicitly by session().
    //
    // Phase B note: openMppSession was rewritten to call mppClient.solana()
    // directly under @solana/mpp@0.5.x, which dropped the session()
    // method. This executor is kept registered for future re-introduction
    // of session-flow MPP (e.g. via tempo.session() — see Phase B.5).
    return false;
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
