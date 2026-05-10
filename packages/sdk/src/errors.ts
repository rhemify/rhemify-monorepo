import type { PolicyDecision } from "./types.js";

export class RhemifyError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "RhemifyError";
  }
}

export class DetectionError extends RhemifyError {
  constructor(
    message: string,
    public url: string,
  ) {
    super(message, "DETECTION_FAILED");
    this.name = "DetectionError";
  }
}

export class PolicyBlockedError extends RhemifyError {
  constructor(
    message: string,
    public decision: PolicyDecision,
  ) {
    super(message, "POLICY_BLOCKED");
    this.name = "PolicyBlockedError";
  }
}

export class BudgetExceededError extends RhemifyError {
  constructor(
    public price: number,
    public budget: number,
  ) {
    super(`Price $${price} exceeds budget $${budget}`, "BUDGET_EXCEEDED");
    this.name = "BudgetExceededError";
  }
}

export class NoWalletError extends RhemifyError {
  constructor(public requiredChain: string) {
    super(`No wallet configured for ${requiredChain}`, "NO_WALLET");
    this.name = "NoWalletError";
  }
}

export class ExecutionError extends RhemifyError {
  constructor(
    message: string,
    public statusCode?: number,
    public txHash?: string,
  ) {
    super(message, "EXECUTION_FAILED");
    this.name = "ExecutionError";
  }
}

/**
 * Thrown when the SDK detects a payment protocol it can recognize but does
 * not yet have an executor for (e.g. L402, AP2, ACP). Callers can switch
 * on `error.code === "PROTOCOL_NOT_IMPLEMENTED"` (or `instanceof
 * ProtocolNotImplementedError`) to provide a graceful UX — surface the
 * detected challenge to the user, fall back to a manual flow, etc. — rather
 * than treating it as a generic execution failure.
 */
export class ProtocolNotImplementedError extends RhemifyError {
  constructor(
    public protocol: string,
    public network: string,
    message?: string,
  ) {
    super(
      message ??
        `Payment protocol "${protocol}" was detected on network "${network}" but Rhemify does not yet have an executor for it. ` +
          `Currently executable protocols: x402 (Solana, EVM), MPP (charge, session, AgentCard).`,
      "PROTOCOL_NOT_IMPLEMENTED",
    );
    this.name = "ProtocolNotImplementedError";
  }
}
