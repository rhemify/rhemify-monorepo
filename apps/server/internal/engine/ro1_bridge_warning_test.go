package engine

import "testing"

func TestRO1BridgeWarning(t *testing.T) {
	rule := &RO1BridgeWarning{}

	tests := []struct {
		name    string
		event   map[string]interface{}
		bridge  *BridgeInfo
		wantAct bool
	}{
		{
			name:  "fires: pct > 20 and abs > $1",
			event: map[string]interface{}{"id": "evt_1", "agent_id": "agent-1", "fleet_id": "fleet-1", "amount": 10.0},
			bridge: &BridgeInfo{
				BridgeCostPct: 30.0, BridgeCostAbs: 3.0,
				Protocol: "cctp", ChainFrom: "ethereum", ChainTo: "solana",
			},
			wantAct: true,
		},
		{
			name:  "no action: pct > 20 but abs <= $1",
			event: map[string]interface{}{"id": "evt_2", "agent_id": "agent-1", "fleet_id": "fleet-1", "amount": 3.0},
			bridge: &BridgeInfo{
				BridgeCostPct: 33.0, BridgeCostAbs: 0.99,
				Protocol: "cctp", ChainFrom: "ethereum", ChainTo: "solana",
			},
			wantAct: false,
		},
		{
			name:  "no action: abs > $1 but pct <= 20",
			event: map[string]interface{}{"id": "evt_3", "agent_id": "agent-1", "fleet_id": "fleet-1", "amount": 100.0},
			bridge: &BridgeInfo{
				BridgeCostPct: 15.0, BridgeCostAbs: 15.0,
				Protocol: "cctp", ChainFrom: "ethereum", ChainTo: "solana",
			},
			wantAct: false,
		},
		{
			name:    "no action: nil bridge",
			event:   map[string]interface{}{"id": "evt_4", "agent_id": "agent-1", "fleet_id": "fleet-1", "amount": 5.0},
			bridge:  nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{Bridge: tt.bridge}
			action := rule.Evaluate(tt.event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil && action.Severity != SeverityAlert {
				t.Errorf("expected ALERT, got %s", action.Severity)
			}
		})
	}
}
