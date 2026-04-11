package engine

import (
	"testing"
	"time"
)

// --- extractBridgeInfo ---

func TestExtractBridgeInfo_ValidTrace(t *testing.T) {
	event := map[string]interface{}{
		"amount":          10.0,
		"chain_from":      "ethereum",
		"chain_to":        "solana",
		"instrument_type": "cctp",
	}
	trace := map[string]interface{}{
		"economic_rationality_check": map[string]interface{}{
			"bridge_cost_pct": 30.0,
		},
	}

	b := extractBridgeInfo(event, trace)
	if b == nil {
		t.Fatal("expected BridgeInfo, got nil")
	}
	if b.BridgeCostPct != 30.0 {
		t.Errorf("expected BridgeCostPct=30, got %f", b.BridgeCostPct)
	}
	if b.BridgeCostAbs != 3.0 {
		t.Errorf("expected BridgeCostAbs=3.0, got %f", b.BridgeCostAbs)
	}
	if b.ChainFrom != "ethereum" {
		t.Errorf("expected ChainFrom=ethereum, got %s", b.ChainFrom)
	}
	if b.ChainTo != "solana" {
		t.Errorf("expected ChainTo=solana, got %s", b.ChainTo)
	}
	if b.Protocol != "cctp" {
		t.Errorf("expected Protocol=cctp, got %s", b.Protocol)
	}
}

func TestExtractBridgeInfo_FallsBackToChainField(t *testing.T) {
	event := map[string]interface{}{
		"amount": 10.0,
		"chain":  "solana", // no chain_from, falls back to chain
	}
	trace := map[string]interface{}{
		"economic_rationality_check": map[string]interface{}{
			"bridge_cost_pct": 25.0,
		},
	}

	b := extractBridgeInfo(event, trace)
	if b == nil {
		t.Fatal("expected BridgeInfo, got nil")
	}
	if b.ChainFrom != "solana" {
		t.Errorf("expected ChainFrom=solana (fallback), got %s", b.ChainFrom)
	}
}

func TestExtractBridgeInfo_NilTrace(t *testing.T) {
	event := map[string]interface{}{"amount": 10.0}
	if b := extractBridgeInfo(event, nil); b != nil {
		t.Errorf("expected nil for nil trace, got %+v", b)
	}
}

func TestExtractBridgeInfo_NoBridgeData(t *testing.T) {
	event := map[string]interface{}{"amount": 10.0}
	trace := map[string]interface{}{
		"agent_task_context": "some task",
	}
	if b := extractBridgeInfo(event, trace); b != nil {
		t.Errorf("expected nil for trace without bridge data, got %+v", b)
	}
}

func TestExtractBridgeInfo_ZeroCostPct(t *testing.T) {
	event := map[string]interface{}{"amount": 10.0}
	trace := map[string]interface{}{
		"economic_rationality_check": map[string]interface{}{
			"bridge_cost_pct": 0.0,
		},
	}
	if b := extractBridgeInfo(event, trace); b != nil {
		t.Errorf("expected nil for zero cost pct, got %+v", b)
	}
}

// --- shouldDedup ---

func TestShouldDedup_VH1_NoDedup(t *testing.T) {
	e := &Engine{dedup: NewDedupCache()}
	action := &Action{TriggerRule: "VH-1", Domain: "bad.com"}
	if e.shouldDedup(action) {
		t.Error("VH-1 should never be deduped")
	}
	// Second call should also not dedup
	if e.shouldDedup(action) {
		t.Error("VH-1 should never be deduped (second call)")
	}
}

func TestShouldDedup_SA2_NoDedup(t *testing.T) {
	e := &Engine{dedup: NewDedupCache()}
	action := &Action{TriggerRule: "SA-2", AgentID: "agent-1"}
	if e.shouldDedup(action) {
		t.Error("SA-2 should never be deduped")
	}
}

func TestShouldDedup_VH2_DedupsByDomain(t *testing.T) {
	e := &Engine{dedup: NewDedupCache()}
	action := &Action{TriggerRule: "VH-2", Domain: "slow.com"}

	if e.shouldDedup(action) {
		t.Error("first VH-2 for slow.com should not dedup")
	}
	if !e.shouldDedup(action) {
		t.Error("second VH-2 for slow.com should dedup")
	}
	// Different domain should not dedup
	action2 := &Action{TriggerRule: "VH-2", Domain: "other.com"}
	if e.shouldDedup(action2) {
		t.Error("VH-2 for different domain should not dedup")
	}
}

func TestShouldDedup_SA1_DedupsByAgent(t *testing.T) {
	e := &Engine{dedup: NewDedupCache()}
	action := &Action{TriggerRule: "SA-1", AgentID: "agent-1"}

	if e.shouldDedup(action) {
		t.Error("first SA-1 should not dedup")
	}
	if !e.shouldDedup(action) {
		t.Error("second SA-1 same agent should dedup")
	}
}

func TestShouldDedup_SA3_DedupsByFleet(t *testing.T) {
	e := &Engine{dedup: NewDedupCache()}
	action := &Action{TriggerRule: "SA-3", FleetID: "fleet-1"}

	if e.shouldDedup(action) {
		t.Error("first SA-3 should not dedup")
	}
	if !e.shouldDedup(action) {
		t.Error("second SA-3 same fleet should dedup")
	}
}

func TestShouldDedup_RO1_DedupsByAgentAndChainPair(t *testing.T) {
	e := &Engine{dedup: NewDedupCache()}
	action := &Action{
		TriggerRule: "RO-1",
		AgentID:     "agent-1",
		Evidence: map[string]interface{}{
			"chain_from": "ethereum",
			"chain_to":   "solana",
		},
	}

	if e.shouldDedup(action) {
		t.Error("first RO-1 should not dedup")
	}
	if !e.shouldDedup(action) {
		t.Error("second RO-1 same agent+chain pair should dedup")
	}

	// Same agent, different chain pair should not dedup
	action2 := &Action{
		TriggerRule: "RO-1",
		AgentID:     "agent-1",
		Evidence: map[string]interface{}{
			"chain_from": "base",
			"chain_to":   "solana",
		},
	}
	if e.shouldDedup(action2) {
		t.Error("RO-1 different chain pair should not dedup")
	}
}

// --- safeStr / safeFloat ---

func TestSafeStr(t *testing.T) {
	m := map[string]interface{}{
		"key":     "value",
		"number":  42.0,
		"nil_val": nil,
	}
	if safeStr(m, "key") != "value" {
		t.Error("expected 'value'")
	}
	if safeStr(m, "missing") != "" {
		t.Error("expected empty string for missing key")
	}
	if safeStr(m, "number") != "" {
		t.Error("expected empty string for non-string value")
	}
	if safeStr(m, "nil_val") != "" {
		t.Error("expected empty string for nil value")
	}
}

func TestSafeFloat(t *testing.T) {
	m := map[string]interface{}{
		"amount":  42.5,
		"text":    "hello",
		"nil_val": nil,
	}
	if safeFloat(m, "amount") != 42.5 {
		t.Error("expected 42.5")
	}
	if safeFloat(m, "missing") != 0 {
		t.Error("expected 0 for missing key")
	}
	if safeFloat(m, "text") != 0 {
		t.Error("expected 0 for non-float value")
	}
}

// --- DedupCache expiry ---

func TestDedupCache_ExpiresAfterWindow(t *testing.T) {
	d := NewDedupCache()

	// Suppress with a very short window
	d.ShouldSuppress("test", "subject", 1*time.Millisecond)

	// Wait for expiry
	time.Sleep(5 * time.Millisecond)

	// Should no longer be suppressed
	if d.ShouldSuppress("test", "subject", 1*time.Millisecond) {
		t.Error("should not suppress after window expiry")
	}
}

// --- Panic recovery in Evaluate ---

type panicRule struct{}

func (r *panicRule) ID() string { return "PANIC" }
func (r *panicRule) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	panic("intentional panic for testing")
}

type counterRule struct {
	count int
}

func (r *counterRule) ID() string { return "COUNTER" }
func (r *counterRule) Evaluate(event map[string]interface{}, ctx *EvalContext) *Action {
	r.count++
	return nil
}

// evaluateWithContext runs rules against a pre-built context, bypassing buildContext
// (which requires a live Convex client). This tests the rule orchestration loop.
func evaluateWithContext(e *Engine, event map[string]interface{}, ctx *EvalContext) {
	for _, rule := range e.rules {
		func() {
			defer func() {
				if r := recover(); r != nil {
					// recovered — same behavior as engine.Evaluate
				}
			}()
			action := rule.Evaluate(event, ctx)
			if action == nil {
				return
			}
			if e.shouldDedup(action) {
				return
			}
			// Skip persist/applyAutoAction (need Convex client)
		}()
	}
}

func TestEvaluate_PanicRecovery(t *testing.T) {
	counter := &counterRule{}
	e := &Engine{
		dedup: NewDedupCache(),
		rules: []Rule{
			&panicRule{}, // this will panic
			counter,      // this should still run
		},
	}

	event := map[string]interface{}{"agent_id": "a1", "fleet_id": "f1", "domain": "test.com"}
	ctx := &EvalContext{}

	evaluateWithContext(e, event, ctx)

	if counter.count != 1 {
		t.Errorf("counter rule should have run despite prior panic, got count=%d", counter.count)
	}
}

// --- Rule evaluation with nil/empty context ---

func TestRules_AllHandleNilContext(t *testing.T) {
	rules := []Rule{
		&VH1BlockVendor{},
		&VH2SlowVendor{},
		&SA1AgentAnomaly{},
		&SA2UnusualPayment{},
		&SA3FleetSpike{},
		&RO1BridgeWarning{},
	}
	event := map[string]interface{}{}
	ctx := &EvalContext{} // all nil sub-contexts

	for _, rule := range rules {
		t.Run(rule.ID(), func(t *testing.T) {
			action := rule.Evaluate(event, ctx)
			if action != nil {
				t.Errorf("rule %s should return nil with empty context, got %+v", rule.ID(), action)
			}
		})
	}
}

func TestRules_AllProduceCorrectRuleID(t *testing.T) {
	tests := []struct {
		rule    Rule
		event   map[string]interface{}
		ctx     *EvalContext
		wantID  string
	}{
		{
			rule:   &VH1BlockVendor{},
			event:  map[string]interface{}{"agent_id": "a1", "fleet_id": "f1"},
			ctx:    &EvalContext{Vendor: &VendorStats{Domain: "bad.com", SuccessRate: 0.3, EventCount: 20, FailureStreak: 5}},
			wantID: "VH-1",
		},
		{
			rule:   &VH2SlowVendor{},
			event:  map[string]interface{}{"agent_id": "a1", "fleet_id": "f1"},
			ctx:    &EvalContext{Vendor: &VendorStats{Domain: "slow.com", AvgLatencyMs: 8000, EventCount: 10}},
			wantID: "VH-2",
		},
		{
			rule:   &SA1AgentAnomaly{},
			event:  map[string]interface{}{"id": "e1", "fleet_id": "f1"},
			ctx:    &EvalContext{Agent: &AgentAggregates{AgentID: "a1", DailySpend: 300, AvgDaily7d: 100, ActiveDays: 7}},
			wantID: "SA-1",
		},
		{
			rule:   &SA2UnusualPayment{},
			event:  map[string]interface{}{"id": "e1", "amount": 100.0, "domain": "x.com", "fleet_id": "f1"},
			ctx:    &EvalContext{Agent: &AgentAggregates{AgentID: "a1", AvgTxAmount: 5.0, TotalEvents: 20}},
			wantID: "SA-2",
		},
		{
			rule:   &SA3FleetSpike{},
			event:  map[string]interface{}{"agent_id": "a1"},
			ctx:    &EvalContext{Fleet: &FleetAggregates{FleetID: "f1", HourlySpend: 500, AvgHourly7d: 100}},
			wantID: "SA-3",
		},
		{
			rule:   &RO1BridgeWarning{},
			event:  map[string]interface{}{"id": "e1", "agent_id": "a1", "fleet_id": "f1", "amount": 10.0},
			ctx:    &EvalContext{Bridge: &BridgeInfo{BridgeCostPct: 30, BridgeCostAbs: 3.0, ChainFrom: "eth", ChainTo: "sol"}},
			wantID: "RO-1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.wantID, func(t *testing.T) {
			action := tt.rule.Evaluate(tt.event, tt.ctx)
			if action == nil {
				t.Fatalf("expected action for %s, got nil", tt.wantID)
			}
			if action.TriggerRule != tt.wantID {
				t.Errorf("expected TriggerRule=%s, got %s", tt.wantID, action.TriggerRule)
			}
			if action.Evidence == nil {
				t.Error("expected non-nil Evidence")
			}
			if action.ActionDetail == "" {
				t.Error("expected non-empty ActionDetail")
			}
		})
	}
}
