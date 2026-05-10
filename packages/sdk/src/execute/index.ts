import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, ProtocolNotImplementedError } from "../errors.js";
import type { PaymentExecutor } from "./types.js";
import { x402SolanaExecutor } from "./x402-solana.js";
import { x402EvmExecutor } from "./x402-evm.js";
import { mppChargeExecutor } from "./mpp-charge.js";
import { mppSessionExecutor } from "./mpp-session.js";
import { agentcardMppExecutor } from "./agentcard-mpp.js";
import { jupiterSwapExecutor } from "./jupiter-swap.js";
import { creditPayExecutor } from "./credit-pay.js";
import {
  l402UnsupportedExecutor,
  ap2UnsupportedExecutor,
  acpUnsupportedExecutor,
} from "./unsupported-protocol.js";

export type { PaymentExecutor } from "./types.js";
export { setAgentCardApiKey } from "./agentcard-mpp.js";
export { setJupiterApiKey } from "./jupiter-swap.js";
export { setCreditConfig } from "./credit-pay.js";

/**
 * Protocols the SDK has REAL executors for (canExecute returns true and
 * execute() actually performs a payment). Detection of any other protocol
 * still succeeds for diagnostics, but execution throws
 * ProtocolNotImplementedError so callers can render a clear message.
 */
export const SUPPORTED_PROTOCOLS = ["x402", "mpp"] as const;
export type SupportedProtocol = (typeof SUPPORTED_PROTOCOLS)[number];

/**
 * Default executor registry, ordered by preference.
 * selectExecutor() returns the first executor that can handle the detection.
 *
 * Order: credit (cheapest) → direct → fiat → swap → session →
 *        unsupported-protocol stubs (always last so real executors win
 *        whenever they apply).
 */
const defaultExecutors: PaymentExecutor[] = [
  creditPayExecutor,
  x402SolanaExecutor,
  x402EvmExecutor,
  agentcardMppExecutor,
  mppChargeExecutor,
  jupiterSwapExecutor,
  mppSessionExecutor,
  l402UnsupportedExecutor,
  ap2UnsupportedExecutor,
  acpUnsupportedExecutor,
];

/**
 * Find the first executor that can handle the given detection + wallet.
 */
export function selectExecutor(
  detection: DetectionResult,
  wallet: WalletConfig,
  executors: PaymentExecutor[] = defaultExecutors,
): PaymentExecutor | null {
  return executors.find((e) => e.canExecute(detection, wallet)) ?? null;
}

/**
 * Execute payment with cascade: try executors in order, fall back on failure.
 * Returns the result from the first executor that succeeds.
 */
export async function executeWithCascade(
  url: string,
  detection: DetectionResult,
  wallet: WalletConfig,
  options: PayOptions,
  executors: PaymentExecutor[] = defaultExecutors,
): Promise<ExecutionResult & { executor: PaymentExecutor }> {
  const eligible = executors.filter((e) => e.canExecute(detection, wallet));

  if (eligible.length === 0) {
    throw new ExecutionError(
      `No executor available for ${detection.protocol} on ${detection.network}`,
    );
  }

  let lastError: Error | null = null;

  for (const executor of eligible) {
    try {
      const result = await executor.execute(url, detection, wallet, options);
      return { ...result, executor };
    } catch (err) {
      // ProtocolNotImplementedError is terminal — no other executor will
      // implement a protocol the SDK doesn't support. Re-throw so callers
      // can switch on the typed error code.
      if (err instanceof ProtocolNotImplementedError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      // Continue to next executor
    }
  }

  throw new ExecutionError(
    `All executors failed for ${detection.protocol} on ${detection.network}. Last error: ${lastError?.message}`,
  );
}
