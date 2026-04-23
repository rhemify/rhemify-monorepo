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
