import type { PolicyDecision } from "./types.js";

export class RhemosError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "RhemosError";
  }
}

export class DetectionError extends RhemosError {
  constructor(
    message: string,
    public url: string,
  ) {
    super(message, "DETECTION_FAILED");
    this.name = "DetectionError";
  }
}

export class PolicyBlockedError extends RhemosError {
  constructor(
    message: string,
    public decision: PolicyDecision,
  ) {
    super(message, "POLICY_BLOCKED");
    this.name = "PolicyBlockedError";
  }
}

export class BudgetExceededError extends RhemosError {
  constructor(
    public price: number,
    public budget: number,
  ) {
    super(`Price $${price} exceeds budget $${budget}`, "BUDGET_EXCEEDED");
    this.name = "BudgetExceededError";
  }
}

export class NoWalletError extends RhemosError {
  constructor(public requiredChain: string) {
    super(`No wallet configured for ${requiredChain}`, "NO_WALLET");
    this.name = "NoWalletError";
  }
}

export class ExecutionError extends RhemosError {
  constructor(
    message: string,
    public statusCode?: number,
    public txHash?: string,
  ) {
    super(message, "EXECUTION_FAILED");
    this.name = "ExecutionError";
  }
}
