package engine

import (
	"encoding/json"
	"log"
	"time"

	cx "github.com/rhemify/server/internal/convex"
)

// Engine orchestrates rule evaluation on every payment event.
// All errors are logged and swallowed — engine failures must never block ingest.
type Engine struct {
	convex *cx.Client
	dedup  *DedupCache
	rules  []Rule
}

// New creates an Engine with all registered rules.
func New(c *cx.Client) *Engine {
	return &Engine{
		convex: c,
		dedup:  NewDedupCache(),
		rules: []Rule{
			&VH1BlockVendor{},
			&VH2SlowVendor{},
			&SA1AgentAnomaly{},
			&SA2UnusualPayment{},
			&SA3FleetSpike{},
			&RO1BridgeWarning{},
		},
	}
}

// Evaluate runs all rules against the event+trace and persists any resulting actions.
func (e *Engine) Evaluate(event, trace map[string]interface{}) {
	ctx := e.buildContext(event, trace)
	for _, rule := range e.rules {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("engine: rule %s panicked: %v", rule.ID(), r)
				}
			}()
			action := rule.Evaluate(event, ctx)
			if action == nil {
				return
			}
			if e.shouldDedup(action) {
				return
			}
			e.persistAction(action, event)
			if action.Severity == SeverityAutoAct {
				e.applyAutoAction(action)
			}
		}()
	}
}

func (e *Engine) shouldDedup(action *Action) bool {
	switch action.TriggerRule {
	case "VH-2":
		return e.dedup.ShouldSuppress("VH-2", action.Domain, 24*time.Hour)
	case "SA-1":
		return e.dedup.ShouldSuppress("SA-1", action.AgentID, 24*time.Hour)
	case "SA-3":
		return e.dedup.ShouldSuppress("SA-3", action.FleetID, 6*time.Hour)
	case "RO-1":
		chainFrom, _ := action.Evidence["chain_from"].(string)
		chainTo, _ := action.Evidence["chain_to"].(string)
		subject := action.AgentID + ":" + chainFrom + "->" + chainTo
		return e.dedup.ShouldSuppress("RO-1", subject, 24*time.Hour)
	default:
		return false
	}
}

func (e *Engine) buildContext(event, trace map[string]interface{}) *EvalContext {
	ctx := &EvalContext{}
	agentID := safeStr(event, "agent_id")
	fleetID := safeStr(event, "fleet_id")
	domain := safeStr(event, "domain")

	if domain != "" {
		ctx.Vendor = e.fetchVendorStats(domain)
		ctx.EdgeCount, ctx.EdgeAvgPmt = e.fetchEdgeStats(agentID, domain)
	}
	if agentID != "" {
		ctx.Agent = e.fetchAgentAggregates(agentID)
	}
	if fleetID != "" {
		ctx.Fleet = e.fetchFleetAggregates(fleetID)
	}
	ctx.Bridge = extractBridgeInfo(event, trace)
	return ctx
}

func (e *Engine) fetchVendorStats(domain string) *VendorStats {
	raw, err := e.convex.Query("vendors:getStatsForEngine", map[string]interface{}{"domain": domain})
	if err != nil || string(raw) == "null" {
		return nil
	}
	var v struct {
		Domain         string   `json:"domain"`
		SuccessRate    float64  `json:"success_rate"`
		AvgLatencyMs   float64  `json:"avg_latency_ms"`
		EventCount     float64  `json:"event_count"`
		FailureStreak  int      `json:"failure_streak"`
		Last10Outcomes []string `json:"last_10_outcomes"`
		IsBlocked      bool     `json:"is_blocked"`
		BlockedUntil   float64  `json:"blocked_until"`
		BlockCount24h  float64  `json:"block_count_24h"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil
	}
	return &VendorStats{
		Domain:         v.Domain,
		SuccessRate:    v.SuccessRate,
		AvgLatencyMs:   v.AvgLatencyMs,
		EventCount:     int64(v.EventCount),
		FailureStreak:  v.FailureStreak,
		Last10Outcomes: v.Last10Outcomes,
		IsBlocked:      v.IsBlocked,
		BlockedUntil:   v.BlockedUntil,
		BlockCount24h:  int64(v.BlockCount24h),
	}
}

func (e *Engine) fetchAgentAggregates(agentID string) *AgentAggregates {
	raw, err := e.convex.Query("aggregates:getAgentAggregates", map[string]interface{}{"agent_id": agentID})
	if err != nil || string(raw) == "null" {
		return nil
	}
	var a struct {
		AgentID     string  `json:"agent_id"`
		DailySpend  float64 `json:"daily_spend"`
		AvgDaily7d  float64 `json:"avg_daily_7d"`
		AvgTxAmount float64 `json:"avg_tx_amount"`
		TotalEvents float64 `json:"total_events"`
		ActiveDays  float64 `json:"active_days"`
	}
	if err := json.Unmarshal(raw, &a); err != nil {
		return nil
	}
	return &AgentAggregates{
		AgentID:     a.AgentID,
		DailySpend:  a.DailySpend,
		AvgDaily7d:  a.AvgDaily7d,
		AvgTxAmount: a.AvgTxAmount,
		TotalEvents: int64(a.TotalEvents),
		ActiveDays:  int64(a.ActiveDays),
	}
}

func (e *Engine) fetchFleetAggregates(fleetID string) *FleetAggregates {
	raw, err := e.convex.Query("aggregates:getFleetAggregates", map[string]interface{}{"fleet_id": fleetID})
	if err != nil || string(raw) == "null" {
		return nil
	}
	var f struct {
		FleetID     string  `json:"fleet_id"`
		HourlySpend float64 `json:"hourly_spend"`
		AvgHourly7d float64 `json:"avg_hourly_7d"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		return nil
	}
	return &FleetAggregates{
		FleetID:     f.FleetID,
		HourlySpend: f.HourlySpend,
		AvgHourly7d: f.AvgHourly7d,
	}
}

func (e *Engine) fetchEdgeStats(agentID, domain string) (int64, float64) {
	raw, err := e.convex.Query("aggregates:getEdgeStats", map[string]interface{}{
		"agent_id": agentID,
		"domain":   domain,
	})
	if err != nil || string(raw) == "null" {
		return 0, 0
	}
	var edge struct {
		EventCount float64 `json:"event_count"`
		AvgPayment float64 `json:"avg_payment"`
	}
	if err := json.Unmarshal(raw, &edge); err != nil {
		return 0, 0
	}
	return int64(edge.EventCount), edge.AvgPayment
}

// extractBridgeInfo pulls bridge cost data from the trace's economic_rationality_check.
func extractBridgeInfo(event, trace map[string]interface{}) *BridgeInfo {
	if trace == nil {
		return nil
	}
	erc, ok := trace["economic_rationality_check"].(map[string]interface{})
	if !ok {
		return nil
	}
	costPct, _ := erc["bridge_cost_pct"].(float64)
	if costPct == 0 {
		return nil
	}
	amount, _ := event["amount"].(float64)
	chainFrom := safeStr(event, "chain_from")
	if chainFrom == "" {
		chainFrom = safeStr(event, "chain")
	}
	chainTo := safeStr(event, "chain_to")

	return &BridgeInfo{
		BridgeCostPct: costPct,
		BridgeCostAbs: amount * costPct / 100.0,
		Protocol:      safeStr(event, "instrument_type"),
		ChainFrom:     chainFrom,
		ChainTo:       chainTo,
	}
}

func (e *Engine) persistAction(action *Action, event map[string]interface{}) {
	args := map[string]interface{}{
		"action_type":      action.ActionType,
		"severity":         string(action.Severity),
		"trigger_rule":     action.TriggerRule,
		"trigger_event_id": safeStr(event, "id"),
		"evidence":         action.Evidence,
		"action_detail":    action.ActionDetail,
		"agent_id":         action.AgentID,
		"domain":           action.Domain,
		"fleet_id":         action.FleetID,
	}
	if _, err := e.convex.Mutation("intelligence:insertAction", args); err != nil {
		log.Printf("engine: failed to persist action %s: %v", action.TriggerRule, err)
	}
}

func (e *Engine) applyAutoAction(action *Action) {
	switch action.TriggerRule {
	case "VH-1":
		args := map[string]interface{}{
			"domain": action.Domain,
			"reason": action.ActionDetail,
		}
		if _, err := e.convex.Mutation("vendors:blockVendor", args); err != nil {
			log.Printf("engine: VH-1 failed to block %s: %v", action.Domain, err)
		}
	}
}

// safeStr extracts a string from a map, returning "" if missing or wrong type.
func safeStr(m map[string]interface{}, key string) string {
	v, _ := m[key].(string)
	return v
}

// safeFloat extracts a float64 from a map, returning 0 if missing or wrong type.
func safeFloat(m map[string]interface{}, key string) float64 {
	v, _ := m[key].(float64)
	return v
}
