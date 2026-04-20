package engine

import "testing"

func TestSUB1SubscriptionRecommend(t *testing.T) {
	rule := &SUB1SubscriptionRecommend{}

	tests := []struct {
		name       string
		event      map[string]interface{}
		edgeCount  int64
		edgeAvgPmt float64
		wantAct    bool
	}{
		{
			name:       "fires: 25 payments to same vendor",
			event:      map[string]interface{}{"id": "evt_1", "agent_id": "agent-1", "fleet_id": "f1", "domain": "api.bloomberg.com", "amount": 0.50},
			edgeCount:  25,
			edgeAvgPmt: 0.50,
			wantAct:    true,
		},
		{
			name:       "no action: only 19 payments (below threshold)",
			event:      map[string]interface{}{"id": "evt_2", "agent_id": "agent-1", "fleet_id": "f1", "domain": "api.bloomberg.com", "amount": 0.50},
			edgeCount:  19,
			edgeAvgPmt: 0.50,
			wantAct:    false,
		},
		{
			name:       "no action: exactly 20 payments (threshold is >20, not >=20)",
			event:      map[string]interface{}{"id": "evt_3", "agent_id": "agent-1", "fleet_id": "f1", "domain": "api.bloomberg.com", "amount": 0.50},
			edgeCount:  20,
			edgeAvgPmt: 0.50,
			wantAct:    false,
		},
		{
			name:       "fires: 50 payments, large total spend",
			event:      map[string]interface{}{"id": "evt_4", "agent_id": "agent-2", "fleet_id": "f1", "domain": "api.reuters.com", "amount": 1.00},
			edgeCount:  50,
			edgeAvgPmt: 1.00,
			wantAct:    true,
		},
		{
			name:       "no action: no edge data (new vendor)",
			event:      map[string]interface{}{"id": "evt_5", "agent_id": "agent-1", "fleet_id": "f1", "domain": "new-vendor.com", "amount": 0.50},
			edgeCount:  0,
			edgeAvgPmt: 0,
			wantAct:    false,
		},
		{
			name:       "no action: no domain on event",
			event:      map[string]interface{}{"id": "evt_6", "agent_id": "agent-1", "fleet_id": "f1", "amount": 0.50},
			edgeCount:  30,
			edgeAvgPmt: 0.50,
			wantAct:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{EdgeCount: tt.edgeCount, EdgeAvgPmt: tt.edgeAvgPmt}
			action := rule.Evaluate(tt.event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil {
				if action.Severity != SeverityFlag {
					t.Errorf("expected FLAG severity, got %s", action.Severity)
				}
				if action.TriggerRule != "SUB-1" {
					t.Errorf("expected SUB-1, got %s", action.TriggerRule)
				}
				if action.Evidence["payment_count"] == nil {
					t.Error("expected payment_count in evidence")
				}
				if action.Evidence["total_spend"] == nil {
					t.Error("expected total_spend in evidence")
				}
			}
		})
	}
}
