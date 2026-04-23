package engine

import "testing"

func TestSA3FleetSpike(t *testing.T) {
	rule := &SA3FleetSpike{}
	event := map[string]interface{}{"id": "evt_test", "agent_id": "agent-1"}

	tests := []struct {
		name    string
		fleet   *FleetAggregates
		wantAct bool
	}{
		{
			name:    "fires: hourly spend > 3x avg, baseline > $50",
			fleet:   &FleetAggregates{FleetID: "fleet-1", HourlySpend: 600, AvgHourly7d: 150},
			wantAct: true,
		},
		{
			name:    "no action: spend exactly at 3x",
			fleet:   &FleetAggregates{FleetID: "fleet-1", HourlySpend: 450, AvgHourly7d: 150},
			wantAct: false,
		},
		{
			name:    "no action: baseline too low",
			fleet:   &FleetAggregates{FleetID: "fleet-1", HourlySpend: 300, AvgHourly7d: 30},
			wantAct: false,
		},
		{
			name:    "no action: baseline is zero",
			fleet:   &FleetAggregates{FleetID: "fleet-1", HourlySpend: 500, AvgHourly7d: 0},
			wantAct: false,
		},
		{
			name:    "no action: nil fleet",
			fleet:   nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{Fleet: tt.fleet}
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
