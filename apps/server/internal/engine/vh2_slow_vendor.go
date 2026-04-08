package engine

import "fmt"

// VH2SlowVendor flags a vendor whose average latency exceeds 5000ms
// with at least 5 events in the window.
type VH2SlowVendor struct{}

func (r *VH2SlowVendor) ID() string { return "VH-2" }

func (r *VH2SlowVendor) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Vendor == nil {
		return nil
	}
	v := ctx.Vendor
	if v.AvgLatencyMs <= 5000 || v.EventCount < 5 {
		return nil
	}
	return &Action{
		ActionType:  "auto_flag",
		Severity:    SeverityFlag,
		TriggerRule: "VH-2",
		Domain:      v.Domain,
		AgentID:     safeStr(event, "agent_id"),
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"slow vendor %s: avg latency %.0fms > 5000ms threshold",
			v.Domain, v.AvgLatencyMs,
		),
		Evidence: map[string]interface{}{
			"domain":         v.Domain,
			"avg_latency_ms": v.AvgLatencyMs,
			"event_count":    v.EventCount,
		},
	}
}
