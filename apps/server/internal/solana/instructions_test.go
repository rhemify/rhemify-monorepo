package solana

import (
	"crypto/sha256"
	"encoding/binary"
	"testing"

	solanago "github.com/gagliardetto/solana-go"
)

func TestAnchorDiscriminator(t *testing.T) {
	tests := []struct {
		name string
	}{
		{"initialize_fleet_vault"},
		{"register_agent_wallet"},
		{"approve_signing"},
		{"freeze_agent"},
	}

	for _, tt := range tests {
		disc := anchorDiscriminator(tt.name)
		// Verify it's the first 8 bytes of SHA256("global:<name>")
		hash := sha256.Sum256([]byte("global:" + tt.name))
		for i := 0; i < 8; i++ {
			if disc[i] != hash[i] {
				t.Errorf("discriminator mismatch for %s at byte %d: got %x, want %x", tt.name, i, disc[i], hash[i])
			}
		}
		// Verify different instructions produce different discriminators
		for _, other := range tests {
			if other.name != tt.name {
				otherDisc := anchorDiscriminator(other.name)
				if disc == otherDisc {
					t.Errorf("discriminator collision between %s and %s", tt.name, other.name)
				}
			}
		}
	}
}

func TestBorshEncoding(t *testing.T) {
	// String encoding
	encoded := borshString("hello")
	if len(encoded) != 9 { // 4 + 5
		t.Fatalf("expected 9 bytes, got %d", len(encoded))
	}
	length := binary.LittleEndian.Uint32(encoded[:4])
	if length != 5 {
		t.Fatalf("expected length 5, got %d", length)
	}
	if string(encoded[4:]) != "hello" {
		t.Fatalf("expected 'hello', got %q", string(encoded[4:]))
	}

	// Empty string
	empty := borshString("")
	if len(empty) != 4 {
		t.Fatalf("expected 4 bytes for empty string, got %d", len(empty))
	}

	// U64 encoding
	u64 := borshU64(1000000)
	val := binary.LittleEndian.Uint64(u64)
	if val != 1000000 {
		t.Fatalf("expected 1000000, got %d", val)
	}

	// Vec<String> encoding
	vec := borshVecString([]string{"base", "ethereum"})
	count := binary.LittleEndian.Uint32(vec[:4])
	if count != 2 {
		t.Fatalf("expected count 2, got %d", count)
	}
}

func TestPDADerivation(t *testing.T) {
	programID := solanago.MustPublicKeyFromBase58("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

	// FleetVault PDA is deterministic
	pda1, bump1, err := FleetVaultPDA(programID, "fleet-001")
	if err != nil {
		t.Fatal(err)
	}
	pda2, bump2, err := FleetVaultPDA(programID, "fleet-001")
	if err != nil {
		t.Fatal(err)
	}
	if pda1 != pda2 || bump1 != bump2 {
		t.Fatal("PDA derivation is not deterministic")
	}

	// Different fleet IDs produce different PDAs
	pda3, _, err := FleetVaultPDA(programID, "fleet-002")
	if err != nil {
		t.Fatal(err)
	}
	if pda1 == pda3 {
		t.Fatal("different fleet IDs should produce different PDAs")
	}

	// AgentWallet PDA
	agentPDA, _, err := AgentWalletPDA(programID, "fleet-001", "agent-001")
	if err != nil {
		t.Fatal(err)
	}
	if agentPDA.IsZero() {
		t.Fatal("agent wallet PDA should not be zero")
	}

	// SigningApproval PDA
	approvalPDA, _, err := SigningApprovalPDA(programID, agentPDA, "nonce-abc")
	if err != nil {
		t.Fatal(err)
	}
	if approvalPDA.IsZero() {
		t.Fatal("signing approval PDA should not be zero")
	}
}

func TestInstructionBuilders(t *testing.T) {
	programID := solanago.MustPublicKeyFromBase58("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
	authority := solanago.NewWallet().PublicKey()
	coSigner := solanago.NewWallet().PublicKey()

	fleetVault, _, _ := FleetVaultPDA(programID, "fleet-001")
	agentWallet, _, _ := AgentWalletPDA(programID, "fleet-001", "agent-001")
	approval, _, _ := SigningApprovalPDA(programID, agentWallet, "nonce-1")

	t.Run("InitializeFleetVault", func(t *testing.T) {
		ix := InitializeFleetVault(programID, fleetVault, authority, "fleet-001", "dwallet-xyz", coSigner, 1000000)
		if ix.ProgramID() != programID {
			t.Fatal("wrong program ID")
		}
		if len(ix.Accounts()) != 3 {
			t.Fatalf("expected 3 accounts, got %d", len(ix.Accounts()))
		}
		data, err := ix.Data()
		if err != nil {
			t.Fatal(err)
		}
		// First 8 bytes should be the discriminator
		disc := anchorDiscriminator("initialize_fleet_vault")
		for i := 0; i < 8; i++ {
			if data[i] != disc[i] {
				t.Fatalf("discriminator mismatch at byte %d", i)
			}
		}
	})

	t.Run("RegisterAgentWallet", func(t *testing.T) {
		ix := RegisterAgentWallet(programID, fleetVault, agentWallet, authority,
			"fleet-001", "agent-001", "dwallet-abc", 500000, 2000000, []string{"base", "ethereum"})
		if len(ix.Accounts()) != 4 {
			t.Fatalf("expected 4 accounts, got %d", len(ix.Accounts()))
		}
		data, err := ix.Data()
		if err != nil {
			t.Fatal(err)
		}
		disc := anchorDiscriminator("register_agent_wallet")
		for i := 0; i < 8; i++ {
			if data[i] != disc[i] {
				t.Fatalf("discriminator mismatch at byte %d", i)
			}
		}
	})

	t.Run("ApproveSigning", func(t *testing.T) {
		ix := ApproveSigning(programID, agentWallet, fleetVault, approval, coSigner,
			"base", "0x1234567890abcdef", 100000, "nonce-1")
		if len(ix.Accounts()) != 5 {
			t.Fatalf("expected 5 accounts, got %d", len(ix.Accounts()))
		}
		// Verify co-signer is marked as signer
		accounts := ix.Accounts()
		if !accounts[3].IsSigner {
			t.Fatal("co-signer should be marked as signer")
		}
	})

	t.Run("FreezeAgent", func(t *testing.T) {
		ix := FreezeAgent(programID, fleetVault, agentWallet, authority, "fleet-001", "agent-001")
		if len(ix.Accounts()) != 3 {
			t.Fatalf("expected 3 accounts, got %d", len(ix.Accounts()))
		}
		// Verify authority is signer
		accounts := ix.Accounts()
		if !accounts[2].IsSigner {
			t.Fatal("authority should be marked as signer")
		}
		// Verify agent wallet is writable
		if !accounts[1].IsWritable {
			t.Fatal("agent wallet should be writable")
		}
	})
}
