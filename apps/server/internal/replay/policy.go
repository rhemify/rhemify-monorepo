package replay

import (
	"fmt"
	"strings"
)

// EvaluatePolicy runs 6 policy rules against snapshot data.
// Returns a PolicyOutcome with per-rule results.
// Rules with missing snapshot data return result "skipped".
func EvaluatePolicy(
	event map[string]interface{},
	policyState map[string]interface{},
	vendorSnapshot map[string]interface{},
	agentContext map[string]interface{},
) PolicyOutcome {
	amount := safeFloat(event, "amount")
	domain := safeStr(event, "domain")
	standard := safeStr(event, "standard")

	var results []RuleResult
	blocked := false

	// 1. daily_limit
	if dl, ok := policyState["daily_limit"]; ok {
		dailyLimit := toFloat(dl)
		spendToday := safeFloat(agentContext, "spend_today")
		total := spendToday + amount
		if total > dailyLimit {
			results = append(results, RuleResult{
				Rule: "daily_limit", Result: "block",
				Threshold: fmt.Sprintf("%.2f", dailyLimit),
				Actual:    fmt.Sprintf("%.2f", total),
			})
			blocked = true
		} else {
			results = append(results, RuleResult{
				Rule: "daily_limit", Result: "pass",
				Threshold: fmt.Sprintf("%.2f", dailyLimit),
				Actual:    fmt.Sprintf("%.2f", total),
			})
		}
	} else {
		results = append(results, RuleResult{Rule: "daily_limit", Result: "skipped", Threshold: "missing", Actual: "missing"})
	}

	// 2. max_per_transaction
	if mpt, ok := policyState["max_per_transaction"]; ok {
		maxPerTx := toFloat(mpt)
		if amount > maxPerTx {
			results = append(results, RuleResult{
				Rule: "max_per_transaction", Result: "block",
				Threshold: fmt.Sprintf("%.2f", maxPerTx),
				Actual:    fmt.Sprintf("%.2f", amount),
			})
			blocked = true
		} else {
			results = append(results, RuleResult{
				Rule: "max_per_transaction", Result: "pass",
				Threshold: fmt.Sprintf("%.2f", maxPerTx),
				Actual:    fmt.Sprintf("%.2f", amount),
			})
		}
	} else {
		results = append(results, RuleResult{Rule: "max_per_transaction", Result: "skipped", Threshold: "missing", Actual: "missing"})
	}

	// 3. domain_allowlist
	if dal, ok := policyState["domain_allowlist"]; ok {
		allowlist := toStringSlice(dal)
		if len(allowlist) == 0 {
			results = append(results, RuleResult{
				Rule: "domain_allowlist", Result: "pass",
				Threshold: "allowlist (empty)", Actual: domain,
			})
		} else if contains(allowlist, domain) {
			results = append(results, RuleResult{
				Rule: "domain_allowlist", Result: "pass",
				Threshold: "allowlist", Actual: domain,
			})
		} else {
			results = append(results, RuleResult{
				Rule: "domain_allowlist", Result: "block",
				Threshold: "allowlist", Actual: domain,
			})
			blocked = true
		}
	} else {
		results = append(results, RuleResult{Rule: "domain_allowlist", Result: "skipped", Threshold: "missing", Actual: domain})
	}

	// 4. standard_allowlist
	if sal, ok := policyState["allowed_standards"]; ok {
		allowlist := toStringSlice(sal)
		if len(allowlist) == 0 {
			results = append(results, RuleResult{
				Rule: "standard_allowlist", Result: "pass",
				Threshold: "allowlist (empty)", Actual: standard,
			})
		} else if contains(allowlist, standard) {
			results = append(results, RuleResult{
				Rule: "standard_allowlist", Result: "pass",
				Threshold: "allowlist", Actual: standard,
			})
		} else {
			results = append(results, RuleResult{
				Rule: "standard_allowlist", Result: "block",
				Threshold: "allowlist", Actual: standard,
			})
			blocked = true
		}
	} else {
		results = append(results, RuleResult{Rule: "standard_allowlist", Result: "skipped", Threshold: "missing", Actual: standard})
	}

	// 5. vendor_blocked
	if vendorData, ok := vendorSnapshot[domain]; ok {
		vm, _ := vendorData.(map[string]interface{})
		isBlocked, _ := vm["is_blocked"].(bool)
		if isBlocked {
			results = append(results, RuleResult{
				Rule: "vendor_blocked", Result: "block",
				Threshold: "not_blocked", Actual: domain,
			})
			blocked = true
		} else {
			results = append(results, RuleResult{
				Rule: "vendor_blocked", Result: "pass",
				Threshold: "not_blocked", Actual: domain,
			})
		}
	} else {
		results = append(results, RuleResult{
			Rule: "vendor_blocked", Result: "pass",
			Threshold: "not_blocked", Actual: domain + " (no vendor data)",
		})
	}

	// 6. approval_threshold (flag, not block)
	if at, ok := policyState["approval_threshold"]; ok {
		threshold := toFloat(at)
		if amount > threshold {
			results = append(results, RuleResult{
				Rule: "approval_threshold", Result: "flag",
				Threshold: fmt.Sprintf("%.2f", threshold),
				Actual:    fmt.Sprintf("%.2f", amount),
			})
		} else {
			results = append(results, RuleResult{
				Rule: "approval_threshold", Result: "pass",
				Threshold: fmt.Sprintf("%.2f", threshold),
				Actual:    fmt.Sprintf("%.2f", amount),
			})
		}
	} else {
		results = append(results, RuleResult{Rule: "approval_threshold", Result: "skipped", Threshold: "missing", Actual: "missing"})
	}

	return PolicyOutcome{
		Allowed:     !blocked,
		RuleResults: results,
	}
}

// ApplyOverrides patches a deep-copied policy_state with overrides.
// Scalar values are replaced directly.
// Array values support add (no prefix) and remove ("-" prefix).
func ApplyOverrides(policyState map[string]interface{}, overrides map[string]interface{}) map[string]interface{} {
	// Deep copy
	result := make(map[string]interface{}, len(policyState))
	for k, v := range policyState {
		result[k] = v
	}

	for key, val := range overrides {
		switch v := val.(type) {
		case []interface{}:
			existing := toStringSlice(result[key])
			for _, entry := range v {
				s, ok := entry.(string)
				if !ok {
					continue
				}
				if strings.HasPrefix(s, "-") {
					existing = removeFromSlice(existing, s[1:])
				} else {
					existing = append(existing, s)
				}
			}
			// Store back as []interface{} for consistency
			iface := make([]interface{}, len(existing))
			for i, s := range existing {
				iface[i] = s
			}
			result[key] = iface
		default:
			result[key] = val
		}
	}

	return result
}

// --- helpers ---

func toStringSlice(v interface{}) []string {
	if v == nil {
		return nil
	}
	switch arr := v.(type) {
	case []interface{}:
		out := make([]string, 0, len(arr))
		for _, item := range arr {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return arr
	}
	return nil
}

func removeFromSlice(slice []string, item string) []string {
	out := make([]string, 0, len(slice))
	for _, s := range slice {
		if s != item {
			out = append(out, s)
		}
	}
	return out
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

func toFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	}
	return 0
}

func safeStr(m map[string]interface{}, key string) string {
	v, _ := m[key].(string)
	return v
}

func safeFloat(m map[string]interface{}, key string) float64 {
	return toFloat(m[key])
}
