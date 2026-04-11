package engine

import "fmt"

// SA3FleetSpike alerts when a fleet's hourly spend exceeds 3x its 7-day hourly average.
// Guard: baseline >= $50 prevents noise on new or low-volume fleets.
type SA3FleetSpike struct{}

func (r *SA3FleetSpike) ID() string { return "SA-3" }

func (r *SA3FleetSpike) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Fleet == nil {
		return nil
	}
	f := ctx.Fleet
	if f.AvgHourly7d < 50.0 || f.HourlySpend <= 3.0*f.AvgHourly7d {
		return nil
	}
	multiplier := f.HourlySpend / f.AvgHourly7d
	return &Action{
		ActionType:  "auto_alert",
		Severity:    SeverityAlert,
		TriggerRule: "SA-3",
		FleetID:     f.FleetID,
		AgentID:     safeStr(event, "agent_id"),
		ActionDetail: fmt.Sprintf(
			"fleet %s spend spike: $%.2f/hr vs $%.2f 7d avg (%.1fx)",
			f.FleetID, f.HourlySpend, f.AvgHourly7d, multiplier,
		),
		Evidence: map[string]interface{}{
			"fleet_id":      f.FleetID,
			"hourly_spend":  f.HourlySpend,
			"avg_hourly_7d": f.AvgHourly7d,
			"multiplier":    fmt.Sprintf("%.1fx", multiplier),
		},
	}
}
