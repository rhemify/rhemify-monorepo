package engine

import "testing"

func TestVH1BlockVendor(t *testing.T) {
	rule := &VH1BlockVendor{}
	event := map[string]interface{}{"id": "evt_test", "agent_id": "agent-1", "fleet_id": "fleet-1"}

	tests := []struct {
		name    string
		vendor  *VendorStats
		wantAct bool
	}{
		{
			name:    "fires: below threshold, min sample met, streak met",
			vendor:  &VendorStats{Domain: "bad.com", SuccessRate: 0.40, EventCount: 15, FailureStreak: 3},
			wantAct: true,
		},
		{
			name:    "no action: success_rate exactly at threshold",
			vendor:  &VendorStats{Domain: "ok.com", SuccessRate: 0.50, EventCount: 15, FailureStreak: 3},
			wantAct: false,
		},
		{
			name:    "no action: above threshold",
			vendor:  &VendorStats{Domain: "good.com", SuccessRate: 0.95, EventCount: 20, FailureStreak: 0},
			wantAct: false,
		},
		{
			name:    "no action: below min sample",
			vendor:  &VendorStats{Domain: "new.com", SuccessRate: 0.20, EventCount: 5, FailureStreak: 3},
			wantAct: false,
		},
		{
			name:    "no action: streak too short",
			vendor:  &VendorStats{Domain: "flaky.com", SuccessRate: 0.40, EventCount: 15, FailureStreak: 2},
			wantAct: false,
		},
		{
			name:    "no action: already blocked",
			vendor:  &VendorStats{Domain: "blocked.com", SuccessRate: 0.20, EventCount: 20, FailureStreak: 5, IsBlocked: true},
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
				if action.Severity != SeverityAutoAct {
					t.Errorf("got severity=%s, want AUTO_ACT", action.Severity)
				}
				if action.TriggerRule != "VH-1" {
					t.Errorf("got rule=%s, want VH-1", action.TriggerRule)
				}
			}
		})
	}
}
