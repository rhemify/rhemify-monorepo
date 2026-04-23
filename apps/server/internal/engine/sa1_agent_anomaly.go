package engine

import "fmt"

// SA1AgentAnomaly alerts when an agent's daily spend exceeds 2x its 7-day average.
// Guards: baseline >= $10 and at least 3 active days prevent false positives.
type SA1AgentAnomaly struct{}

func (r *SA1AgentAnomaly) ID() string { return "SA-1" }

func (r *SA1AgentAnomaly) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Agent == nil {
		return nil
	}
	a := ctx.Agent
	if a.AvgDaily7d < 10.0 || a.ActiveDays < 3 {
		return nil
	}
	if a.DailySpend <= 2.0*a.AvgDaily7d {
		return nil
	}
	pctOver := (a.DailySpend/a.AvgDaily7d - 1) * 100
	return &Action{
		ActionType:  "auto_alert",
		Severity:    SeverityAlert,
		TriggerRule: "SA-1",
		AgentID:     a.AgentID,
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"agent %s spend anomaly: $%.2f today vs $%.2f 7d avg (%.0f%% over)",
			a.AgentID, a.DailySpend, a.AvgDaily7d, pctOver,
		),
		Evidence: map[string]interface{}{
			"agent_id":            a.AgentID,
			"daily_spend":         a.DailySpend,
			"avg_daily_7d":        a.AvgDaily7d,
			"pct_over":            fmt.Sprintf("%.0f%%", pctOver),
			"triggering_event_id": safeStr(event, "id"),
		},
	}
}
