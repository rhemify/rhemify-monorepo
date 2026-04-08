package engine

import "fmt"

// SA2UnusualPayment flags a single payment that is unusually large.
// Guards: min absolute amount, min event history, and vendor-specific context.
type SA2UnusualPayment struct{}

func (r *SA2UnusualPayment) ID() string { return "SA-2" }

func (r *SA2UnusualPayment) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Agent == nil {
		return nil
	}
	a := ctx.Agent
	amount := safeFloat(event, "amount")

	if amount <= 5.0 || a.TotalEvents < 10 {
		return nil
	}
	if amount <= 5.0*a.AvgTxAmount {
		return nil
	}
	// If we have vendor-specific history (5+ payments), check vendor-normal range
	if ctx.EdgeCount >= 5 && ctx.EdgeAvgPmt > 0 && amount <= 3.0*ctx.EdgeAvgPmt {
		return nil
	}

	domain := safeStr(event, "domain")
	evidence := map[string]interface{}{
		"event_id":     safeStr(event, "id"),
		"amount":       amount,
		"agent_avg_tx": a.AvgTxAmount,
		"domain":       domain,
		"standard":     safeStr(event, "standard"),
	}
	if ctx.EdgeCount >= 5 {
		evidence["vendor_avg_for_agent"] = ctx.EdgeAvgPmt
		evidence["vendor_event_count"] = ctx.EdgeCount
	}

	return &Action{
		ActionType:  "auto_flag",
		Severity:    SeverityFlag,
		TriggerRule: "SA-2",
		AgentID:     a.AgentID,
		Domain:      domain,
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"unusual payment $%.2f by agent %s (%.0fx agent avg $%.2f)",
			amount, a.AgentID, amount/a.AvgTxAmount, a.AvgTxAmount,
		),
		Evidence: evidence,
	}
}
