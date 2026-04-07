package signer

import (
	"context"
	"testing"

	solanago "github.com/gagliardetto/solana-go"
	solclient "github.com/rhemify/server/internal/solana"
)

// mockTransactor records sent transactions for assertion.
type mockTransactor struct {
	blockhash solanago.Hash
	lastTx    *solanago.Transaction
	signature solanago.Signature
}

func (m *mockTransactor) GetLatestBlockhash(_ context.Context) (solanago.Hash, error) {
	return m.blockhash, nil
}

func (m *mockTransactor) SendAndConfirmTx(_ context.Context, tx *solanago.Transaction) (solanago.Signature, error) {
	m.lastTx = tx
	return m.signature, nil
}

func TestCosignerApproveSigning(t *testing.T) {
	wallet := solanago.NewWallet()
	programID := solanago.MustPublicKeyFromBase58("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

	mock := &mockTransactor{
		blockhash: solanago.MustHashFromBase58("4NCYB3kRT8sCNodPNuCZo8VUh4xqpBQxsxTQ8hmSFYh8"),
		signature: solanago.MustSignatureFromBase58("5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"),
	}

	cosigner := NewCosigner(mock, wallet.PrivateKey, programID)

	// Derive PDAs for test
	fleetVault, _, err := solclient.FleetVaultPDA(programID, "fleet-001")
	if err != nil {
		t.Fatal(err)
	}
	agentWallet, _, err := solclient.AgentWalletPDA(programID, "fleet-001", "agent-001")
	if err != nil {
		t.Fatal(err)
	}

	sig, err := cosigner.ApproveSigning(
		context.Background(),
		agentWallet,
		fleetVault,
		"base",
		"0x1234567890abcdef",
		100000,
		"nonce-1",
	)
	if err != nil {
		t.Fatalf("ApproveSigning failed: %v", err)
	}
	if sig != mock.signature {
		t.Fatal("expected mock signature")
	}
	if mock.lastTx == nil {
		t.Fatal("expected transaction to be sent")
	}

	// Verify the transaction has exactly 1 instruction
	if len(mock.lastTx.Message.Instructions) != 1 {
		t.Fatalf("expected 1 instruction, got %d", len(mock.lastTx.Message.Instructions))
	}
}

func TestCosignerFreezeAgent(t *testing.T) {
	wallet := solanago.NewWallet()
	programID := solanago.MustPublicKeyFromBase58("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

	mock := &mockTransactor{
		blockhash: solanago.MustHashFromBase58("4NCYB3kRT8sCNodPNuCZo8VUh4xqpBQxsxTQ8hmSFYh8"),
		signature: solanago.MustSignatureFromBase58("5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"),
	}

	cosigner := NewCosigner(mock, wallet.PrivateKey, programID)

	fleetVault, _, _ := solclient.FleetVaultPDA(programID, "fleet-001")
	agentWallet, _, _ := solclient.AgentWalletPDA(programID, "fleet-001", "agent-001")

	sig, err := cosigner.FreezeAgent(
		context.Background(),
		fleetVault,
		agentWallet,
		"fleet-001",
		"agent-001",
	)
	if err != nil {
		t.Fatalf("FreezeAgent failed: %v", err)
	}
	if sig != mock.signature {
		t.Fatal("expected mock signature")
	}
	if mock.lastTx == nil {
		t.Fatal("expected transaction to be sent")
	}
}

func TestCosignerPublicKey(t *testing.T) {
	wallet := solanago.NewWallet()
	programID := solanago.MustPublicKeyFromBase58("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
	cosigner := NewCosigner(nil, wallet.PrivateKey, programID)

	if cosigner.PublicKey() != wallet.PublicKey() {
		t.Fatal("cosigner public key should match wallet public key")
	}
}
