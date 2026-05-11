package replay

import (
	"testing"
)

// --- EvaluatePolicy tests ---

func TestEvaluatePolicy_AllPass(t *testing.T) {
	event := map[string]interface{}{
		"amount":   0.80,
		"domain":   "api.bloomberg.com",
		"standard": "x402",
	}
	policy := map[string]interface{}{
		"daily_limit":          500.0,
		"max_per_transaction":  100.0,
		"approval_threshold":   50.0,
		"allowed_standards":    []interface{}{"x402", "mpp"},
		"domain_allowlist":     []interface{}{"api.bloomberg.com", "api.reuters.com"},
	}
	vendor := map[string]interface{}{
		"api.bloomberg.com": map[string]interface{}{"is_blocked": false},
	}
	agent := map[string]interface{}{
		"spend_today": 340.0,
	}

	outcome := EvaluatePolicy(event, policy, vendor, agent)

	if !outcome.Allowed {
		t.Error("expected Allowed=true, all rules should pass")
	}
	if len(outcome.RuleResults) != 6 {
		t.Errorf("expected 6 rule results, got %d", len(outcome.RuleResults))
	}
	for _, r := range outcome.RuleResults {
		if r.Result != "pass" {
			t.Errorf("rule %s: expected pass, got %s", r.Rule, r.Result)
		}
	}
}

func TestEvaluatePolicy_DailyLimitBlock(t *testing.T) {
	event := map[string]interface{}{"amount": 200.0, "domain": "x.com", "standard": "x402"}
	policy := map[string]interface{}{"daily_limit": 500.0}
	agent := map[string]interface{}{"spend_today": 400.0}

	outcome := EvaluatePolicy(event, policy, map[string]interface{}{}, agent)

	if outcome.Allowed {
		t.Error("expected Allowed=false, daily_limit exceeded (400+200 > 500)")
	}
	found := findRule(outcome, "daily_limit")
	if found == nil || found.Result != "block" {
		t.Errorf("expected daily_limit block, got %+v", found)
	}
}

func TestEvaluatePolicy_DailyLimitExactBoundary(t *testing.T) {
	event := map[string]interface{}{"amount": 100.0, "domain": "x.com", "standard": "x402"}
	policy := map[string]interface{}{"daily_limit": 500.0}
	agent := map[string]interface{}{"spend_today": 400.0}

	outcome := EvaluatePolicy(event, policy, map[string]interface{}{}, agent)

	// 400 + 100 = 500, not > 500
	found := findRule(outcome, "daily_limit")
	if found == nil || found.Result != "pass" {
		t.Errorf("expected daily_limit pass at exact boundary, got %+v", found)
	}
}

func TestEvaluatePolicy_MaxPerTxBlock(t *testing.T) {
	event := map[string]interface{}{"amount": 150.0, "domain": "x.com", "standard": "x402"}
	policy := map[string]interface{}{"max_per_transaction": 100.0}

	outcome := EvaluatePolicy(event, policy, map[string]interface{}{}, map[string]interface{}{})

	found := findRule(outcome, "max_per_transaction")
	if found == nil || found.Result != "block" {
		t.Errorf("expected max_per_transaction block, got %+v", found)
	}
}

func TestEvaluatePolicy_DomainNotInAllowlist(t *testing.T) {
	event := map[string]interface{}{"amount": 1.0, "domain": "evil.com", "standard": "x402"}
	policy := map[string]interface{}{
		"domain_allowlist": []interface{}{"api.bloomberg.com"},
	}

	outcome := EvaluatePolicy(event, policy, map[string]interface{}{}, map[string]interface{}{})

	found := findRule(outcome, "domain_allowlist")
	if found == nil || found.Result != "block" {
		t.Errorf("expected domain_allowlist block, got %+v", found)
	}
}

func TestEvaluatePolicy_EmptyAllowlistSkipsCheck(t *testing.T) {
	event := map[string]interface{}{"amount": 1.0, "domain": "anything.com", "standard": "weird"}
	policy := map[string]interface{}{
		"domain_allowlist":  []interface{}{},
		"allowed_standards": []interface{}{},
	}

	outcome := EvaluatePolicy(event, policy, map[string]interface{}{}, map[string]interface{}{})

	for _, r := range outcome.RuleResults {
		if r.Rule == "domain_allowlist" && r.Result == "block" {
			t.Error("empty domain_allowlist should not block")
		}
		if r.Rule == "standard_allowlist" && r.Result == "block" {
			t.Error("empty standard_allowlist should not block")
		}
	}
}

func TestEvaluatePolicy_VendorBlocked(t *testing.T) {
	event := map[string]interface{}{"amount": 1.0, "domain": "bad.com", "standard": "x402"}
	vendor := map[string]interface{}{
		"bad.com": map[string]interface{}{"is_blocked": true},
	}

	outcome := EvaluatePolicy(event, map[string]interface{}{}, vendor, map[string]interface{}{})

	found := findRule(outcome, "vendor_blocked")
	if found == nil || found.Result != "block" {
		t.Errorf("expected vendor_blocked block, got %+v", found)
	}
}

func TestEvaluatePolicy_ApprovalThresholdFlags(t *testing.T) {
	event := map[string]interface{}{"amount": 75.0, "domain": "x.com", "standard": "x402"}
	policy := map[string]interface{}{"approval_threshold": 50.0}

	outcome := EvaluatePolicy(event, policy, map[string]interface{}{}, map[string]interface{}{})

	// Flag should NOT block
	if !outcome.Allowed {
		t.Error("approval_threshold flag should not block the payment")
	}
	found := findRule(outcome, "approval_threshold")
	if found == nil || found.Result != "flag" {
		t.Errorf("expected approval_threshold flag, got %+v", found)
	}
}

func TestEvaluatePolicy_ApprovalThresholdDisabledWhenZero(t *testing.T) {
	// SDK convention: approval_threshold == 0 means "no approval required".
	// Go must match — replay diff should not spuriously flag every real
	// payment just because the Go-served policy default is 0.
	event := map[string]interface{}{"amount": 0.50, "domain": "x.com", "standard": "x402"}
	policy := map[string]interface{}{"approval_threshold": 0.0}

	outcome := EvaluatePolicy(event, policy, map[string]interface{}{}, map[string]interface{}{})

	if !outcome.Allowed {
		t.Error("threshold=0 must not block the payment")
	}
	found := findRule(outcome, "approval_threshold")
	if found == nil || found.Result != "pass" {
		t.Errorf("expected approval_threshold pass when threshold=0, got %+v", found)
	}
	if found != nil && found.Threshold != "disabled" {
		t.Errorf("expected threshold field to read 'disabled', got %q", found.Threshold)
	}
}

func TestEvaluatePolicy_ApprovalThresholdFlagsAtBoundary(t *testing.T) {
	// Boundary semantic: amount == threshold flags (matches SDK
	// `price >= threshold` check, line 161 of rules.ts).
	event := map[string]interface{}{"amount": 50.0, "domain": "x.com", "standard": "x402"}
	policy := map[string]interface{}{"approval_threshold": 50.0}

	outcome := EvaluatePolicy(event, policy, map[string]interface{}{}, map[string]interface{}{})

	found := findRule(outcome, "approval_threshold")
	if found == nil || found.Result != "flag" {
		t.Errorf("amount == threshold should flag (inclusive boundary), got %+v", found)
	}
}

func TestEvaluatePolicy_MissingDataSkips(t *testing.T) {
	event := map[string]interface{}{"amount": 1.0, "domain": "x.com", "standard": "x402"}
	// All empty — no policy fields, no vendor, no agent
	outcome := EvaluatePolicy(event, map[string]interface{}{}, map[string]interface{}{}, map[string]interface{}{})

	for _, r := range outcome.RuleResults {
		if r.Result == "block" || r.Result == "flag" {
			t.Errorf("rule %s should skip with missing data, got %s", r.Rule, r.Result)
		}
	}
}

// --- ApplyOverrides tests ---

func TestApplyOverrides_ScalarReplace(t *testing.T) {
	policy := map[string]interface{}{"daily_limit": 500.0}
	overrides := map[string]interface{}{"daily_limit": 100.0}

	result := ApplyOverrides(policy, overrides)

	if result["daily_limit"] != 100.0 {
		t.Errorf("expected daily_limit=100, got %v", result["daily_limit"])
	}
}

func TestApplyOverrides_ArrayRemove(t *testing.T) {
	policy := map[string]interface{}{
		"domain_allowlist": []interface{}{"api.bloomberg.com", "api.reuters.com"},
	}
	overrides := map[string]interface{}{
		"domain_allowlist": []interface{}{"-api.bloomberg.com"},
	}

	result := ApplyOverrides(policy, overrides)

	list := toStringSlice(result["domain_allowlist"])
	if len(list) != 1 || list[0] != "api.reuters.com" {
		t.Errorf("expected [api.reuters.com], got %v", list)
	}
}

func TestApplyOverrides_ArrayAdd(t *testing.T) {
	policy := map[string]interface{}{
		"domain_allowlist": []interface{}{"api.bloomberg.com"},
	}
	overrides := map[string]interface{}{
		"domain_allowlist": []interface{}{"api.newvendor.com"},
	}

	result := ApplyOverrides(policy, overrides)

	list := toStringSlice(result["domain_allowlist"])
	if len(list) != 2 {
		t.Errorf("expected 2 entries, got %v", list)
	}
}

func TestApplyOverrides_PreservesUnchanged(t *testing.T) {
	policy := map[string]interface{}{
		"daily_limit":         500.0,
		"max_per_transaction": 100.0,
	}
	overrides := map[string]interface{}{
		"daily_limit": 200.0,
	}

	result := ApplyOverrides(policy, overrides)

	if result["max_per_transaction"] != 100.0 {
		t.Errorf("max_per_transaction should be unchanged, got %v", result["max_per_transaction"])
	}
}

// --- helpers ---

func findRule(outcome PolicyOutcome, rule string) *RuleResult {
	for _, r := range outcome.RuleResults {
		if r.Rule == rule {
			return &r
		}
	}
	return nil
}
