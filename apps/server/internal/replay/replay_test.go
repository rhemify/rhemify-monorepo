package replay

import (
	"testing"
)

// --- ComputeDiff tests ---

func TestComputeDiff_NoDifference(t *testing.T) {
	outcome := PolicyOutcome{
		Allowed: true,
		RuleResults: []RuleResult{
			{Rule: "daily_limit", Result: "pass"},
			{Rule: "vendor_blocked", Result: "pass"},
		},
	}

	diffs := ComputeDiff(outcome, outcome)
	if len(diffs) != 0 {
		t.Errorf("expected no diffs, got %d", len(diffs))
	}
}

func TestComputeDiff_OneRuleChanged(t *testing.T) {
	original := PolicyOutcome{
		RuleResults: []RuleResult{
			{Rule: "daily_limit", Result: "pass"},
			{Rule: "vendor_blocked", Result: "pass"},
		},
	}
	replayed := PolicyOutcome{
		RuleResults: []RuleResult{
			{Rule: "daily_limit", Result: "block"},
			{Rule: "vendor_blocked", Result: "pass"},
		},
	}

	diffs := ComputeDiff(original, replayed)
	if len(diffs) != 1 {
		t.Fatalf("expected 1 diff, got %d", len(diffs))
	}
	if diffs[0].Rule != "daily_limit" || !diffs[0].Changed {
		t.Errorf("unexpected diff: %+v", diffs[0])
	}
}

func TestComputeDiff_MultipleChanges(t *testing.T) {
	original := PolicyOutcome{
		RuleResults: []RuleResult{
			{Rule: "daily_limit", Result: "pass"},
			{Rule: "domain_allowlist", Result: "pass"},
			{Rule: "vendor_blocked", Result: "pass"},
		},
	}
	replayed := PolicyOutcome{
		RuleResults: []RuleResult{
			{Rule: "daily_limit", Result: "block"},
			{Rule: "domain_allowlist", Result: "block"},
			{Rule: "vendor_blocked", Result: "pass"},
		},
	}

	diffs := ComputeDiff(original, replayed)
	if len(diffs) != 2 {
		t.Errorf("expected 2 diffs, got %d", len(diffs))
	}
}

// --- Replay orchestrator tests ---

func TestReplay_FullFlow_NoOverrides(t *testing.T) {
	snapshot := map[string]interface{}{
		"policy_state": map[string]interface{}{
			"daily_limit":         500.0,
			"max_per_transaction": 100.0,
			"approval_threshold":  50.0,
			"allowed_standards":   []interface{}{"x402"},
			"domain_allowlist":    []interface{}{"api.bloomberg.com"},
		},
		"vendor_registry_snapshot": map[string]interface{}{
			"api.bloomberg.com": map[string]interface{}{"is_blocked": false},
		},
		"agent_context": map[string]interface{}{
			"spend_today": 340.0,
		},
	}

	originalRulesFired := []interface{}{
		map[string]interface{}{"rule": "daily_limit", "result": "pass", "value": "340.80", "threshold": "500.00"},
		map[string]interface{}{"rule": "max_per_transaction", "result": "pass", "value": "0.80", "threshold": "100.00"},
		map[string]interface{}{"rule": "domain_allowlist", "result": "pass", "value": "api.bloomberg.com", "threshold": "allowlist"},
		map[string]interface{}{"rule": "standard_allowlist", "result": "pass", "value": "x402", "threshold": "allowlist"},
		map[string]interface{}{"rule": "vendor_blocked", "result": "pass", "value": "api.bloomberg.com", "threshold": "not_blocked"},
		map[string]interface{}{"rule": "approval_threshold", "result": "pass", "value": "0.80", "threshold": "50.00"},
	}

	event := map[string]interface{}{
		"amount":   0.80,
		"domain":   "api.bloomberg.com",
		"standard": "x402",
	}

	result, err := Replay("trc_test", snapshot, originalRulesFired, event, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !result.Original.Allowed {
		t.Error("original should be allowed")
	}
	if !result.Replayed.Allowed {
		t.Error("replayed should be allowed (no overrides)")
	}
	if result.CounterfactualBlocked {
		t.Error("should not be counterfactual blocked")
	}
	if result.TraceID != "trc_test" {
		t.Errorf("expected trace_id=trc_test, got %s", result.TraceID)
	}
}

func TestReplay_WithOverrides_CausesBlock(t *testing.T) {
	snapshot := map[string]interface{}{
		"policy_state": map[string]interface{}{
			"daily_limit":         500.0,
			"max_per_transaction": 100.0,
			"domain_allowlist":    []interface{}{"api.bloomberg.com", "api.reuters.com"},
		},
		"vendor_registry_snapshot": map[string]interface{}{},
		"agent_context": map[string]interface{}{
			"spend_today": 340.0,
		},
	}

	originalRulesFired := []interface{}{
		map[string]interface{}{"rule": "daily_limit", "result": "pass", "value": "340.80", "threshold": "500.00"},
	}

	event := map[string]interface{}{
		"amount":   0.80,
		"domain":   "api.bloomberg.com",
		"standard": "x402",
	}

	overrides := map[string]interface{}{
		"daily_limit":      50.0, // 340 + 0.80 > 50 → block
		"domain_allowlist": []interface{}{"-api.bloomberg.com"}, // remove bloomberg → block
	}

	result, err := Replay("trc_test", snapshot, originalRulesFired, event, overrides)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !result.CounterfactualBlocked {
		t.Error("should be counterfactual blocked with tighter limits")
	}
	if len(result.Diff) == 0 {
		t.Error("expected diff entries for changed rules")
	}
}

func TestReplay_MissingSnapshot_ReturnsError(t *testing.T) {
	// Missing policy_state and agent_context
	snapshot := map[string]interface{}{
		"vendor_registry_snapshot": map[string]interface{}{},
	}

	_, err := Replay("trc_test", snapshot, nil, map[string]interface{}{}, nil)
	if err == nil {
		t.Fatal("expected error for incomplete snapshot")
	}

	snapErr, ok := err.(*SnapshotError)
	if !ok {
		t.Fatalf("expected SnapshotError, got %T", err)
	}
	if len(snapErr.Missing) != 2 {
		t.Errorf("expected 2 missing fields, got %v", snapErr.Missing)
	}
}

func TestReplay_EmptySnapshot_ReturnsError(t *testing.T) {
	_, err := Replay("trc_test", map[string]interface{}{}, nil, map[string]interface{}{}, nil)
	if err == nil {
		t.Fatal("expected error for empty snapshot")
	}

	snapErr, ok := err.(*SnapshotError)
	if !ok {
		t.Fatalf("expected SnapshotError, got %T", err)
	}
	if len(snapErr.Missing) != 3 {
		t.Errorf("expected 3 missing fields, got %v", snapErr.Missing)
	}
}
