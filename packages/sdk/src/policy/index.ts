import type { DetectionResult, PolicyContext, PolicyDecision } from "../types.js";
import { defaultRules } from "./rules.js";
import type { PolicyRule } from "./rules.js";
import { GoServerTransport } from "../transport/index.js";

export type { PolicyRule } from "./rules.js";

export class PolicyEngine {
  private transport: GoServerTransport;
  private agentId: string;
  private cacheTtl: number;
  private cached: { context: PolicyContext; expiresAt: number } | null = null;
  private rules: PolicyRule[];

  constructor(
    transport: GoServerTransport,
    agentId: string,
    cacheTtl: number = 30_000,
    rules?: PolicyRule[],
  ) {
    this.transport = transport;
    this.agentId = agentId;
    this.cacheTtl = cacheTtl;
    this.rules = rules ?? defaultRules;
  }

  /**
   * Evaluate all policy rules against a detection result.
   * Fetches current policy from Go server (cached for cacheTtl ms).
   * Returns the aggregate decision AND the context the decision was made
   * against. The caller is expected to snapshot the context into the trace's
   * replay_snapshot.policy_state so the Go replay engine has real values to
   * work with — without that, every counterfactual replay runs against an
   * empty policy and produces meaningless output.
   */
  async evaluate(
    detection: DetectionResult,
    domain: string,
  ): Promise<{ decision: PolicyDecision; context: PolicyContext }> {
    const context = await this.getContext();
    return { decision: this.evaluateWithContext(detection, domain, context), context };
  }

  /**
   * Evaluate with a provided context (no server fetch). Useful for testing
   * and for replay/counterfactual analysis.
   */
  evaluateWithContext(
    detection: DetectionResult,
    domain: string,
    context: PolicyContext,
  ): PolicyDecision {
    const rulesFired = this.rules.map((rule) => rule.evaluate(detection, domain, context));

    // Block takes precedence over flag, flag over allow
    const blocked = rulesFired.find((r) => r.decision === "block");
    if (blocked) {
      return {
        action: "block",
        rulesFired,
        reason: `Blocked by ${blocked.rule}: ${blocked.actual} exceeds ${blocked.threshold}`,
        suggestion: getSuggestion(blocked.rule),
      };
    }

    const flagged = rulesFired.find((r) => r.decision === "flag");
    if (flagged) {
      return {
        action: "flag",
        rulesFired,
        reason: `Flagged by ${flagged.rule}: requires approval`,
      };
    }

    return { action: "allow", rulesFired };
  }

  /** Invalidate the policy cache (called after setPolicy) */
  invalidateCache(): void {
    this.cached = null;
  }

  private async getContext(): Promise<PolicyContext> {
    const now = Date.now();
    if (this.cached && now < this.cached.expiresAt) {
      return this.cached.context;
    }

    try {
      const context = await this.transport.getPolicy(this.agentId);
      this.cached = { context, expiresAt: now + this.cacheTtl };
      return context;
    } catch {
      // Fallback to permissive defaults when Go server is unreachable.
      // This allows the SDK to work during development without the full stack.
      const fallback: PolicyContext = {
        policy: {
          dailyLimit: 100,
          maxPerTransaction: 50,
          approvalThreshold: 0,
          allowedStandards: [],
          domainAllowlist: [],
        },
        spentToday: 0,
        blockedDomains: [],
      };
      this.cached = { context: fallback, expiresAt: now + this.cacheTtl };
      return fallback;
    }
  }
}

function getSuggestion(rule: string): string | undefined {
  switch (rule) {
    case "daily_limit":
      return "Wait until tomorrow or request a limit increase.";
    case "max_per_transaction":
      return "This payment exceeds the per-transaction limit.";
    case "domain_allowlist":
      return "This domain is not in the allowed list. Contact your fleet operator.";
    case "standard_allowlist":
      return "This payment standard is not allowed by policy.";
    case "vendor_blocked":
      return "This vendor was auto-blocked by intelligence due to poor reliability. Contact your fleet operator to unblock.";
    default:
      return undefined;
  }
}
