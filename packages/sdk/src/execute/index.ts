import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError } from "../errors.js";
import type { PaymentExecutor } from "./types.js";
import { x402SolanaExecutor } from "./x402-solana.js";
import { x402EvmExecutor } from "./x402-evm.js";
import { mppChargeExecutor } from "./mpp-charge.js";
import { mppSessionExecutor } from "./mpp-session.js";

export type { PaymentExecutor } from "./types.js";

/**
 * Default executor registry, ordered by preference.
 * selectExecutor() returns the first executor that can handle the detection.
 */
const defaultExecutors: PaymentExecutor[] = [
  x402SolanaExecutor,
  x402EvmExecutor,
  mppChargeExecutor,
  mppSessionExecutor,
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
      lastError = err instanceof Error ? err : new Error(String(err));
      // Continue to next executor
    }
  }

  throw new ExecutionError(
    `All executors failed for ${detection.protocol} on ${detection.network}. Last error: ${lastError?.message}`,
  );
}
