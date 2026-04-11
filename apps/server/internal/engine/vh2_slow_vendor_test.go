package engine

import "testing"

func TestVH2SlowVendor(t *testing.T) {
	rule := &VH2SlowVendor{}
	event := map[string]interface{}{"id": "evt_test", "agent_id": "agent-1", "fleet_id": "fleet-1"}

	tests := []struct {
		name    string
		vendor  *VendorStats
		wantAct bool
	}{
		{
			name:    "fires: avg latency above 5000ms, min sample met",
			vendor:  &VendorStats{Domain: "slow.com", AvgLatencyMs: 6000, EventCount: 10},
			wantAct: true,
		},
		{
			name:    "no action: latency exactly at threshold",
			vendor:  &VendorStats{Domain: "ok.com", AvgLatencyMs: 5000, EventCount: 10},
			wantAct: false,
		},
		{
			name:    "no action: fast vendor",
			vendor:  &VendorStats{Domain: "fast.com", AvgLatencyMs: 200, EventCount: 20},
			wantAct: false,
		},
		{
			name:    "no action: slow but below min sample",
			vendor:  &VendorStats{Domain: "new.com", AvgLatencyMs: 8000, EventCount: 3},
			wantAct: false,
		},
		{
			name:    "no action: nil vendor",
			vendor:  nil,
			wantAct: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &EvalContext{Vendor: tt.vendor}
			action := rule.Evaluate(event, ctx)
			if (action != nil) != tt.wantAct {
				t.Errorf("got action=%v, want wantAct=%v", action != nil, tt.wantAct)
			}
			if action != nil {
				if action.Severity != SeverityFlag {
					t.Errorf("expected FLAG, got %s", action.Severity)
				}
			}
		})
	}
}
