package engine

import "fmt"

// VH1BlockVendor auto-blocks a vendor whose sliding-window success rate drops
// below 50% with at least 10 events and 3 consecutive failures.
type VH1BlockVendor struct{}

func (r *VH1BlockVendor) ID() string { return "VH-1" }

func (r *VH1BlockVendor) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Vendor == nil || ctx.Vendor.IsBlocked {
		return nil
	}
	v := ctx.Vendor
	if v.SuccessRate >= 0.50 || v.EventCount < 10 || v.FailureStreak < 3 {
		return nil
	}
	return &Action{
		ActionType:  "auto_block",
		Severity:    SeverityAutoAct,
		TriggerRule: "VH-1",
		Domain:      v.Domain,
		AgentID:     safeStr(event, "agent_id"),
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"auto-blocked %s: success_rate %.0f%% < 50%% with %d consecutive failures",
			v.Domain, v.SuccessRate*100, v.FailureStreak,
		),
		Evidence: map[string]interface{}{
			"domain":           v.Domain,
			"success_rate":     v.SuccessRate,
			"event_count":      v.EventCount,
			"failure_streak":   v.FailureStreak,
			"last_10_outcomes": v.Last10Outcomes,
		},
	}
}
