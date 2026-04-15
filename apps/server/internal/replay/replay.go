package replay

import "fmt"

// PolicyOutcome is the result of evaluating all policy rules.
type PolicyOutcome struct {
	Allowed     bool         `json:"allowed"`
	RuleResults []RuleResult `json:"rule_results"`
}

// RuleResult is one policy rule evaluation.
type RuleResult struct {
	Rule      string `json:"rule"`
	Result    string `json:"result"` // "pass" | "block" | "flag" | "skipped"
	Threshold string `json:"threshold"`
	Actual    string `json:"actual"`
}

// PolicyDiff highlights a rule whose outcome changed between original and replay.
type PolicyDiff struct {
	Rule           string `json:"rule"`
	OriginalResult string `json:"original_result"`
	ReplayedResult string `json:"replayed_result"`
	Changed        bool   `json:"changed"`
}

// ReplayRequest is the HTTP request body.
type ReplayRequest struct {
	PolicyOverrides map[string]interface{} `json:"policy_overrides"`
}

// ReplayResult is the HTTP response.
type ReplayResult struct {
	TraceID               string        `json:"trace_id"`
	SnapshotComplete      bool          `json:"snapshot_complete"`
	Original              PolicyOutcome `json:"original"`
	Replayed              PolicyOutcome `json:"replayed"`
	Diff                  []PolicyDiff  `json:"diff"`
	CounterfactualBlocked bool          `json:"counterfactual_blocked"`
}

// SnapshotError is returned when the replay_snapshot is missing required fields.
type SnapshotError struct {
	Missing []string
}

func (e *SnapshotError) Error() string {
	return fmt.Sprintf("incomplete snapshot, missing: %v", e.Missing)
}

// Replay reconstructs a payment decision from the trace's replay_snapshot,
// re-evaluates policy rules with optional overrides, and returns a diff.
// Pure computation — no side effects, no data written.
func Replay(
	traceID string,
	replaySnapshot map[string]interface{},
	policyRulesFired []interface{},
	event map[string]interface{},
	overrides map[string]interface{},
) (*ReplayResult, error) {

	// Validate snapshot completeness
	var missing []string
	policyState, _ := replaySnapshot["policy_state"].(map[string]interface{})
	if policyState == nil {
		missing = append(missing, "policy_state")
	}
	vendorSnapshot, _ := replaySnapshot["vendor_registry_snapshot"].(map[string]interface{})
	if vendorSnapshot == nil {
		missing = append(missing, "vendor_registry_snapshot")
	}
	agentContext, _ := replaySnapshot["agent_context"].(map[string]interface{})
	if agentContext == nil {
		missing = append(missing, "agent_context")
	}
	if len(missing) > 0 {
		return nil, &SnapshotError{Missing: missing}
	}

	// Build original outcome from trace's policy_rules_fired
	original := buildOriginalOutcome(policyRulesFired)

	// Apply overrides to a copy of policy_state
	replayPolicy := ApplyOverrides(policyState, overrides)

	// Re-evaluate policy
	replayed := EvaluatePolicy(event, replayPolicy, vendorSnapshot, agentContext)

	// Compute diff
	diff := ComputeDiff(original, replayed)

	return &ReplayResult{
		TraceID:               traceID,
		SnapshotComplete:      true,
		Original:              original,
		Replayed:              replayed,
		Diff:                  diff,
		CounterfactualBlocked: !replayed.Allowed,
	}, nil
}

// buildOriginalOutcome converts the trace's policy_rules_fired array into a PolicyOutcome.
// Each entry is expected to be: { "rule": "...", "value": "...", "result": "pass"|"block"|"flag" }
func buildOriginalOutcome(policyRulesFired []interface{}) PolicyOutcome {
	var results []RuleResult
	blocked := false

	for _, item := range policyRulesFired {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		rule, _ := m["rule"].(string)
		result, _ := m["result"].(string)
		value, _ := m["value"].(string)
		threshold, _ := m["threshold"].(string)

		if result == "block" {
			blocked = true
		}
		results = append(results, RuleResult{
			Rule:      rule,
			Result:    result,
			Threshold: threshold,
			Actual:    value,
		})
	}

	return PolicyOutcome{
		Allowed:     !blocked,
		RuleResults: results,
	}
}
