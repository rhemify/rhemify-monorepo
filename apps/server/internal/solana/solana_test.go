package solana_test

import (
	"testing"

	"github.com/gagliardetto/solana-go"
)

func TestSolanaGoImport(t *testing.T) {
	// Verify solana-go is wired correctly by creating a PublicKey
	pk := solana.MustPublicKeyFromBase58("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
	if pk.IsZero() {
		t.Fatal("expected non-zero public key for token program")
	}
	if pk != solana.TokenProgramID {
		t.Fatalf("expected token program ID, got %s", pk)
	}
	t.Logf("solana-go wired successfully, token program: %s", pk)
}
