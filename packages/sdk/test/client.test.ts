import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createRhemos,
  RhemosError,
  DetectionError,
  PolicyBlockedError,
  BudgetExceededError,
  NoWalletError,
  ExecutionError,
} from "../src/index.js";

describe("createRhemos", () => {
  it("returns an object with pay, probe, session, setPolicy, status", () => {
    const rhemos = createRhemos({
      serverUrl: "http://localhost:8080",
      fleetApiKey: "test-key",
      agentId: "agent-1",
      fleetId: "fleet-1",
      wallet: { solanaPrivateKey: "fake-key" },
    });

    expect(rhemos).toHaveProperty("pay");
    expect(rhemos).toHaveProperty("probe");
    expect(rhemos).toHaveProperty("session");
    expect(rhemos).toHaveProperty("setPolicy");
    expect(rhemos).toHaveProperty("status");
    expect(typeof rhemos.pay).toBe("function");
    expect(typeof rhemos.probe).toBe("function");
    expect(typeof rhemos.session).toBe("function");
    expect(typeof rhemos.setPolicy).toBe("function");
    expect(typeof rhemos.status).toBe("function");
  });
});

describe("error hierarchy", () => {
  it("all errors extend RhemosError", () => {
    const detection = new DetectionError("fail", "https://x.com");
    const policy = new PolicyBlockedError("blocked", {
      action: "block",
      rulesFired: [],
      reason: "over limit",
    });
    const budget = new BudgetExceededError(5, 1);
    const wallet = new NoWalletError("solana");
    const execution = new ExecutionError("tx failed", 500);

    expect(detection).toBeInstanceOf(RhemosError);
    expect(policy).toBeInstanceOf(RhemosError);
    expect(budget).toBeInstanceOf(RhemosError);
    expect(wallet).toBeInstanceOf(RhemosError);
    expect(execution).toBeInstanceOf(RhemosError);
  });

  it("errors have correct codes", () => {
    expect(new DetectionError("x", "u").code).toBe("DETECTION_FAILED");
    expect(
      new PolicyBlockedError("x", { action: "block", rulesFired: [] }).code,
    ).toBe("POLICY_BLOCKED");
    expect(new BudgetExceededError(5, 1).code).toBe("BUDGET_EXCEEDED");
    expect(new NoWalletError("sol").code).toBe("NO_WALLET");
    expect(new ExecutionError("x").code).toBe("EXECUTION_FAILED");
  });

  it("errors have correct names for instanceof checks", () => {
    expect(new DetectionError("x", "u").name).toBe("DetectionError");
    expect(
      new PolicyBlockedError("x", { action: "block", rulesFired: [] }).name,
    ).toBe("PolicyBlockedError");
    expect(new BudgetExceededError(5, 1).name).toBe("BudgetExceededError");
    expect(new NoWalletError("sol").name).toBe("NoWalletError");
    expect(new ExecutionError("x").name).toBe("ExecutionError");
  });

  it("BudgetExceededError carries price and budget", () => {
    const err = new BudgetExceededError(5.5, 1.0);
    expect(err.price).toBe(5.5);
    expect(err.budget).toBe(1.0);
    expect(err.message).toBe("Price $5.5 exceeds budget $1");
  });
});
