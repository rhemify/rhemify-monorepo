package solana

import (
	"fmt"

	solanago "github.com/gagliardetto/solana-go"
)

// FleetVaultPDA derives the PDA for a fleet vault.
// Seeds: ["fleet-vault", fleet_id]
func FleetVaultPDA(programID solanago.PublicKey, fleetID string) (solanago.PublicKey, uint8, error) {
	addr, bump, err := solanago.FindProgramAddress(
		[][]byte{
			[]byte("fleet-vault"),
			[]byte(fleetID),
		},
		programID,
	)
	if err != nil {
		return solanago.PublicKey{}, 0, fmt.Errorf("derive fleet vault PDA: %w", err)
	}
	return addr, bump, nil
}

// AgentWalletPDA derives the PDA for an agent wallet.
// Seeds: ["agent-wallet", fleet_id, agent_key]
func AgentWalletPDA(programID solanago.PublicKey, fleetID, agentKey string) (solanago.PublicKey, uint8, error) {
	addr, bump, err := solanago.FindProgramAddress(
		[][]byte{
			[]byte("agent-wallet"),
			[]byte(fleetID),
			[]byte(agentKey),
		},
		programID,
	)
	if err != nil {
		return solanago.PublicKey{}, 0, fmt.Errorf("derive agent wallet PDA: %w", err)
	}
	return addr, bump, nil
}

// SigningApprovalPDA derives the PDA for a signing approval.
// Seeds: ["signing-approval", agent_wallet_pubkey, nonce]
func SigningApprovalPDA(programID solanago.PublicKey, agentWallet solanago.PublicKey, nonce string) (solanago.PublicKey, uint8, error) {
	addr, bump, err := solanago.FindProgramAddress(
		[][]byte{
			[]byte("signing-approval"),
			agentWallet.Bytes(),
			[]byte(nonce),
		},
		programID,
	)
	if err != nil {
		return solanago.PublicKey{}, 0, fmt.Errorf("derive signing approval PDA: %w", err)
	}
	return addr, bump, nil
}
