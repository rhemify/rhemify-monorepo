import type { DetectionResult, PolicyContext, PolicyDecisionRecord } from "../types.js";

export interface PolicyRule {
  name: string;
  evaluate(
    detection: DetectionResult,
    domain: string,
    context: PolicyContext,
  ): PolicyDecisionRecord;
}

export const dailyLimitRule: PolicyRule = {
  name: "daily_limit",
  evaluate(detection, _domain, context) {
    const price = Number(detection.priceRaw) / 1_000_000; // base units → USD
    const projectedSpend = context.spentToday + price;
    const limit = context.policy.dailyLimit;

    if (projectedSpend > limit) {
      return {
        rule: "daily_limit",
        decision: "block",
        threshold: `$${limit}`,
        actual: `$${projectedSpend.toFixed(2)} (today: $${context.spentToday.toFixed(2)} + this: $${price.toFixed(2)})`,
      };
    }
    return {
      rule: "daily_limit",
      decision: "allow",
      threshold: `$${limit}`,
      actual: `$${projectedSpend.toFixed(2)}`,
    };
  },
};

export const maxPerTransactionRule: PolicyRule = {
  name: "max_per_transaction",
  evaluate(detection, _domain, context) {
    const price = Number(detection.priceRaw) / 1_000_000;
    const limit = context.policy.maxPerTransaction;

    if (price > limit) {
      return {
        rule: "max_per_transaction",
        decision: "block",
        threshold: `$${limit}`,
        actual: `$${price.toFixed(2)}`,
      };
    }
    return {
      rule: "max_per_transaction",
      decision: "allow",
      threshold: `$${limit}`,
      actual: `$${price.toFixed(2)}`,
    };
  },
};

export const allowedDomainsRule: PolicyRule = {
  name: "domain_allowlist",
  evaluate(_detection, domain, context) {
    const allowlist = context.policy.domainAllowlist;

    // Empty allowlist = allow all domains
    if (allowlist.length === 0) {
      return {
        rule: "domain_allowlist",
        decision: "allow",
        threshold: "any",
        actual: domain,
      };
    }

    if (allowlist.includes(domain)) {
      return {
        rule: "domain_allowlist",
        decision: "allow",
        threshold: allowlist.join(", "),
        actual: domain,
      };
    }

    return {
      rule: "domain_allowlist",
      decision: "block",
      threshold: allowlist.join(", "),
      actual: domain,
    };
  },
};

export const allowedStandardsRule: PolicyRule = {
  name: "standard_allowlist",
  evaluate(detection, _domain, context) {
    const allowed = context.policy.allowedStandards;

    // Empty = allow all
    if (allowed.length === 0) {
      return {
        rule: "standard_allowlist",
        decision: "allow",
        threshold: "any",
        actual: detection.protocol,
      };
    }

    if (allowed.includes(detection.protocol)) {
      return {
        rule: "standard_allowlist",
        decision: "allow",
        threshold: allowed.join(", "),
        actual: detection.protocol,
      };
    }

    return {
      rule: "standard_allowlist",
      decision: "block",
      threshold: allowed.join(", "),
      actual: detection.protocol,
    };
  },
};

export const blockedDomainRule: PolicyRule = {
  name: "vendor_blocked",
  evaluate(_detection, domain, context) {
    if (context.blockedDomains.includes(domain)) {
      return {
        rule: "vendor_blocked",
        decision: "block",
        threshold: "not in blocked list",
        actual: `${domain} (auto-blocked by intelligence)`,
      };
    }
    return {
      rule: "vendor_blocked",
      decision: "allow",
      threshold: "not in blocked list",
      actual: domain,
    };
  },
};

export const approvalThresholdRule: PolicyRule = {
  name: "approval_threshold",
  evaluate(detection, _domain, context) {
    const price = Number(detection.priceRaw) / 1_000_000;
    const threshold = context.policy.approvalThreshold;

    // 0 means no approval required
    if (threshold === 0) {
      return {
        rule: "approval_threshold",
        decision: "allow",
        threshold: "disabled",
        actual: `$${price.toFixed(2)}`,
      };
    }

    if (price >= threshold) {
      return {
        rule: "approval_threshold",
        decision: "flag",
        threshold: `$${threshold}`,
        actual: `$${price.toFixed(2)}`,
      };
    }

    return {
      rule: "approval_threshold",
      decision: "allow",
      threshold: `$${threshold}`,
      actual: `$${price.toFixed(2)}`,
    };
  },
};

/** Default rule evaluation order */
export const defaultRules: PolicyRule[] = [
  blockedDomainRule,
  allowedDomainsRule,
  allowedStandardsRule,
  dailyLimitRule,
  maxPerTransactionRule,
  approvalThresholdRule,
];
