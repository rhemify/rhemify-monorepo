package engine

import "testing"

func TestSA1AgentAnomaly(t *testing.T) {
	rule := &SA1AgentAnomaly{}
	event := map[string]interface{}{"id": "evt_test", "fleet_id": "fleet-1"}

	tests := []struct {
		name    string
		agent   *AgentAggregates
		wantAct bool
	}{
		{
			name:    "fires: daily spend > 2x avg, baseline > $10, active days >= 3",
			agent:   &AgentAggregates{AgentID: "agent-1", DailySpend: 280, AvgDaily7d: 120, ActiveDays: 7, TotalEvents: 50},
			wantAct: true,
		},
		{
			name:    "no action: spend exactly at 2x",
			agent:   &AgentAggregates{AgentID: "agent-1", DailySpend: 240, AvgDaily7d: 120, ActiveDays: 7, TotalEvents: 50},
			wantAct: false,
		},
		{
			name:    "no action: baseline too low",
			agent:   &AgentAggregates{AgentID: "agent-1", DailySpend: 30, AvgDaily7d: 5, ActiveDays: 7, TotalEvents: 50},
			wantAct: false,
		},
		{
			name:    "no action: not enough history",
			agent:   &AgentAggregates{AgentID: "agent-1", DailySpend: 280, AvgDaily7d: 120, ActiveDays: 2, TotalEvents: 50},
			wantAct: false,
		},
		{
			name:    "no action: nil agent",
			agent:   nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{Agent: tt.agent}
			action := rule.Evaluate(event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil && action.Severity != SeverityAlert {
				t.Errorf("expected ALERT, got %s", action.Severity)
			}
		})
	}
}
