package model

import "testing"

func TestValidateDWalletTransition(t *testing.T) {
	valid := []struct{ from, to string }{
		{"creating", "active"},
		{"active", "frozen"},
		{"frozen", "active"},
		{"active", "revoked"},
		{"frozen", "revoked"},
	}
	for _, tt := range valid {
		if err := ValidateDWalletTransition(tt.from, tt.to); err != nil {
			t.Errorf("expected valid transition %s → %s, got error: %v", tt.from, tt.to, err)
		}
	}

	invalid := []struct{ from, to string }{
		{"creating", "frozen"},
		{"creating", "revoked"},
		{"revoked", "active"},
		{"revoked", "frozen"},
		{"active", "creating"},
	}
	for _, tt := range invalid {
		if err := ValidateDWalletTransition(tt.from, tt.to); err == nil {
			t.Errorf("expected invalid transition %s → %s to return error", tt.from, tt.to)
		}
	}
}

func TestValidateSigningTransition(t *testing.T) {
	// Full happy path
	happyPath := []struct{ from, to string }{
		{"pending", "approved"},
		{"approved", "signed"},
		{"signed", "broadcast"},
		{"broadcast", "confirmed"},
	}
	for _, tt := range happyPath {
		if err := ValidateSigningTransition(tt.from, tt.to); err != nil {
			t.Errorf("expected valid transition %s → %s, got error: %v", tt.from, tt.to, err)
		}
	}

	// Rejection path
	if err := ValidateSigningTransition("pending", "rejected"); err != nil {
		t.Errorf("expected pending → rejected to be valid, got: %v", err)
	}

	// Failure from any non-terminal state
	failableStates := []string{"pending", "approved", "signed", "broadcast"}
	for _, from := range failableStates {
		if err := ValidateSigningTransition(from, "failed"); err != nil {
			t.Errorf("expected %s → failed to be valid, got: %v", from, err)
		}
	}

	// Invalid transitions
	invalid := []struct{ from, to string }{
		{"confirmed", "failed"},
		{"rejected", "approved"},
		{"failed", "pending"},
		{"pending", "signed"},
		{"approved", "broadcast"},
		{"confirmed", "pending"},
	}
	for _, tt := range invalid {
		if err := ValidateSigningTransition(tt.from, tt.to); err == nil {
			t.Errorf("expected invalid transition %s → %s to return error", tt.from, tt.to)
		}
	}
}
