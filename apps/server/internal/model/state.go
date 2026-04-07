package model

import "fmt"

// dWallet status constants
const (
	DWalletStatusCreating = "creating"
	DWalletStatusActive   = "active"
	DWalletStatusFrozen   = "frozen"
	DWalletStatusRevoked  = "revoked"
)

// Signing request status constants
const (
	SigningStatusPending   = "pending"
	SigningStatusApproved  = "approved"
	SigningStatusRejected  = "rejected"
	SigningStatusSigned    = "signed"
	SigningStatusBroadcast = "broadcast"
	SigningStatusConfirmed = "confirmed"
	SigningStatusFailed    = "failed"
)

type stateTransition struct {
	from, to string
}

var validDWalletTransitions = map[stateTransition]bool{
	{"creating", "active"}:  true,
	{"active", "frozen"}:    true,
	{"frozen", "active"}:    true,
	{"active", "revoked"}:   true,
	{"frozen", "revoked"}:   true,
}

var validSigningTransitions = map[stateTransition]bool{
	{"pending", "approved"}:    true,
	{"pending", "rejected"}:    true,
	{"approved", "signed"}:     true,
	{"signed", "broadcast"}:    true,
	{"broadcast", "confirmed"}: true,
	// Any non-terminal state can transition to failed
	{"pending", "failed"}:   true,
	{"approved", "failed"}:  true,
	{"signed", "failed"}:    true,
	{"broadcast", "failed"}: true,
}

func ValidateDWalletTransition(from, to string) error {
	if validDWalletTransitions[stateTransition{from, to}] {
		return nil
	}
	return fmt.Errorf("invalid dWallet transition: %s → %s", from, to)
}

func ValidateSigningTransition(from, to string) error {
	if validSigningTransitions[stateTransition{from, to}] {
		return nil
	}
	return fmt.Errorf("invalid signing request transition: %s → %s", from, to)
}
