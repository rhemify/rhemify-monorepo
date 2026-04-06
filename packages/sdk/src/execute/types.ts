import type {
  DetectionResult,
  ExecutionResult,
  PayOptions,
  PaymentProtocol,
  WalletConfig,
} from "../types.js";

export interface PaymentExecutor {
  /** Which protocol this executor handles */
  protocol: PaymentProtocol;
  /** Which networks this executor supports */
  networks: string[];
  /** Check if this executor can handle the given detection */
  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean;
  /** Execute the payment */
  execute(
    url: string,
    detection: DetectionResult,
    wallet: WalletConfig,
    options: PayOptions,
  ): Promise<ExecutionResult>;
}
