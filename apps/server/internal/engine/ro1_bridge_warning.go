package engine

import "fmt"

// RO1BridgeWarning alerts when a bridge fee exceeds both 20% of the payment
// and $1 in absolute terms, filtering out trivial fees.
type RO1BridgeWarning struct{}

func (r *RO1BridgeWarning) ID() string { return "RO-1" }

func (r *RO1BridgeWarning) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	if ctx.Bridge == nil {
		return nil
	}
	b := ctx.Bridge
	if b.BridgeCostPct <= 20.0 || b.BridgeCostAbs <= 1.0 {
		return nil
	}
	amount := safeFloat(event, "amount")
	return &Action{
		ActionType:  "auto_alert",
		Severity:    SeverityAlert,
		TriggerRule: "RO-1",
		AgentID:     safeStr(event, "agent_id"),
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"expensive bridge: %.0f%% fee ($%.2f) on $%.2f payment %s→%s",
			b.BridgeCostPct, b.BridgeCostAbs, amount, b.ChainFrom, b.ChainTo,
		),
		Evidence: map[string]interface{}{
			"event_id":        safeStr(event, "id"),
			"bridge_cost":     b.BridgeCostAbs,
			"payment_amount":  amount,
			"bridge_cost_pct": b.BridgeCostPct,
			"chain_from":      b.ChainFrom,
			"chain_to":        b.ChainTo,
			"protocol":        b.Protocol,
			"suggestion":      fmt.Sprintf("Rebalance funds to %s to avoid bridge fees", b.ChainTo),
		},
	}
}
