package engine

import "testing"

func TestSA2UnusualPayment(t *testing.T) {
	rule := &SA2UnusualPayment{}
	baseAgent := &AgentAggregates{AgentID: "agent-1", AvgTxAmount: 5.0, TotalEvents: 20}

	tests := []struct {
		name       string
		event      map[string]interface{}
		agent      *AgentAggregates
		edgeCount  int64
		edgeAvgPmt float64
		wantAct    bool
	}{
		{
			name:    "fires: amount > 5x avg, above min absolute",
			event:   map[string]interface{}{"id": "evt_1", "amount": 30.0, "domain": "api.com", "standard": "x402", "fleet_id": "f1"},
			agent:   baseAgent,
			wantAct: true,
		},
		{
			name:    "no action: amount <= 5x avg",
			event:   map[string]interface{}{"id": "evt_2", "amount": 25.0, "domain": "api.com", "standard": "x402", "fleet_id": "f1"},
			agent:   baseAgent,
			wantAct: false,
		},
		{
			name:    "no action: below min absolute ($5)",
			event:   map[string]interface{}{"id": "evt_3", "amount": 0.30, "domain": "api.com", "standard": "x402", "fleet_id": "f1"},
			agent:   &AgentAggregates{AgentID: "agent-1", AvgTxAmount: 0.05, TotalEvents: 20},
			wantAct: false,
		},
		{
			name:    "no action: not enough history",
			event:   map[string]interface{}{"id": "evt_4", "amount": 30.0, "domain": "api.com", "standard": "x402", "fleet_id": "f1"},
			agent:   &AgentAggregates{AgentID: "agent-1", AvgTxAmount: 5.0, TotalEvents: 5},
			wantAct: false,
		},
		{
			name:       "no action: normal for this vendor",
			event:      map[string]interface{}{"id": "evt_5", "amount": 30.0, "domain": "expensive.com", "standard": "x402", "fleet_id": "f1"},
			agent:      baseAgent,
			edgeCount:  10,
			edgeAvgPmt: 12.0, // 30 <= 3*12=36
			wantAct:    false,
		},
		{
			name:    "no action: nil agent",
			event:   map[string]interface{}{"id": "evt_6", "amount": 100.0, "domain": "api.com", "fleet_id": "f1"},
			agent:   nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{Agent: tt.agent, EdgeCount: tt.edgeCount, EdgeAvgPmt: tt.edgeAvgPmt}
			action := rule.Evaluate(tt.event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil && action.Severity != SeverityFlag {
				t.Errorf("expected FLAG, got %s", action.Severity)
			}
		})
	}
}
