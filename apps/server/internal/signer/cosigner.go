package signer

import (
	"context"
	"fmt"

	solanago "github.com/gagliardetto/solana-go"
	solclient "github.com/rhemify/server/internal/solana"
)

// SolanaTransactor is the interface the cosigner needs from the Solana client.
type SolanaTransactor interface {
	GetLatestBlockhash(ctx context.Context) (solanago.Hash, error)
	SendAndConfirmTx(ctx context.Context, tx *solanago.Transaction) (solanago.Signature, error)
}

// Cosigner builds, signs, and submits transactions to the rhemify-dwallet program.
type Cosigner struct {
	client     SolanaTransactor
	privateKey solanago.PrivateKey
	programID  solanago.PublicKey
}

func NewCosigner(client SolanaTransactor, privateKey solanago.PrivateKey, programID solanago.PublicKey) *Cosigner {
	return &Cosigner{
		client:     client,
		privateKey: privateKey,
		programID:  programID,
	}
}

// PublicKey returns the co-signer's public key.
func (c *Cosigner) PublicKey() solanago.PublicKey {
	return c.privateKey.PublicKey()
}

// ApproveSigning builds an approve_signing transaction, signs it, and sends it.
func (c *Cosigner) ApproveSigning(
	ctx context.Context,
	agentWallet solanago.PublicKey,
	fleetVault solanago.PublicKey,
	targetChain string,
	targetAddress string,
	amount uint64,
	nonce string,
) (solanago.Signature, error) {
	approvalPDA, _, err := solclient.SigningApprovalPDA(c.programID, agentWallet, nonce)
	if err != nil {
		return solanago.Signature{}, fmt.Errorf("derive signing approval PDA: %w", err)
	}

	ix := solclient.ApproveSigning(
		c.programID,
		agentWallet,
		fleetVault,
		approvalPDA,
		c.privateKey.PublicKey(),
		targetChain,
		targetAddress,
		amount,
		nonce,
	)

	return c.buildSignSend(ctx, ix)
}

// FreezeAgent builds a freeze_agent transaction, signs it, and sends it.
func (c *Cosigner) FreezeAgent(
	ctx context.Context,
	fleetVault solanago.PublicKey,
	agentWallet solanago.PublicKey,
	fleetID string,
	agentKey string,
) (solanago.Signature, error) {
	ix := solclient.FreezeAgent(
		c.programID,
		fleetVault,
		agentWallet,
		c.privateKey.PublicKey(),
		fleetID,
		agentKey,
	)

	return c.buildSignSend(ctx, ix)
}

func (c *Cosigner) buildSignSend(ctx context.Context, ix solanago.Instruction) (solanago.Signature, error) {
	blockhash, err := c.client.GetLatestBlockhash(ctx)
	if err != nil {
		return solanago.Signature{}, fmt.Errorf("get blockhash: %w", err)
	}

	tx, err := solanago.NewTransaction(
		[]solanago.Instruction{ix},
		blockhash,
		solanago.TransactionPayer(c.privateKey.PublicKey()),
	)
	if err != nil {
		return solanago.Signature{}, fmt.Errorf("build transaction: %w", err)
	}

	_, err = tx.Sign(func(key solanago.PublicKey) *solanago.PrivateKey {
		if key == c.privateKey.PublicKey() {
			return &c.privateKey
		}
		return nil
	})
	if err != nil {
		return solanago.Signature{}, fmt.Errorf("sign transaction: %w", err)
	}

	sig, err := c.client.SendAndConfirmTx(ctx, tx)
	if err != nil {
		return solanago.Signature{}, fmt.Errorf("send and confirm: %w", err)
	}

	return sig, nil
}
