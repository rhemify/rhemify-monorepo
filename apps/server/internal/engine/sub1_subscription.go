package engine

import "fmt"

// SUB1SubscriptionRecommend recommends switching to a subscription when an
// agent is making repeated micropayments to the same vendor (20+ payments).
// This addresses the core criticism of per-call micropayments — we're smart
// enough to tell you when to stop using them.
type SUB1SubscriptionRecommend struct{}

func (r *SUB1SubscriptionRecommend) ID() string { return "SUB-1" }

func (r *SUB1SubscriptionRecommend) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	domain := safeStr(event, "domain")
	if domain == "" || ctx.EdgeCount <= 20 {
		return nil
	}

	totalSpend := float64(ctx.EdgeCount) * ctx.EdgeAvgPmt
	agentID := safeStr(event, "agent_id")

	return &Action{
		ActionType:  "recommend",
		Severity:    SeverityFlag,
		TriggerRule: "SUB-1",
		AgentID:     agentID,
		Domain:      domain,
		FleetID:     safeStr(event, "fleet_id"),
		ActionDetail: fmt.Sprintf(
			"agent %s has made %d payments to %s ($%.2f total) — consider a subscription",
			agentID, ctx.EdgeCount, domain, totalSpend,
		),
		Evidence: map[string]interface{}{
			"agent_id":      agentID,
			"domain":        domain,
			"payment_count": ctx.EdgeCount,
			"total_spend":   totalSpend,
			"avg_payment":   ctx.EdgeAvgPmt,
		},
	}
}
