package solana

import (
	"context"
	"fmt"
	"time"

	solanago "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

// SolanaClient wraps the solana-go RPC client for server use cases.
type SolanaClient struct {
	rpc *rpc.Client
}

func NewSolanaClient(rpcURL string) *SolanaClient {
	return &SolanaClient{
		rpc: rpc.New(rpcURL),
	}
}

func (c *SolanaClient) GetLatestBlockhash(ctx context.Context) (solanago.Hash, error) {
	result, err := c.rpc.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		return solanago.Hash{}, fmt.Errorf("get latest blockhash: %w", err)
	}
	return result.Value.Blockhash, nil
}

func (c *SolanaClient) GetAccountInfo(ctx context.Context, pubkey solanago.PublicKey) (*rpc.GetAccountInfoResult, error) {
	result, err := c.rpc.GetAccountInfo(ctx, pubkey)
	if err != nil {
		return nil, fmt.Errorf("get account info for %s: %w", pubkey, err)
	}
	return result, nil
}

// SendAndConfirmTx sends a transaction and polls for confirmation.
// Uses polling instead of WebSocket subscription — more reliable for backend services.
func (c *SolanaClient) SendAndConfirmTx(ctx context.Context, tx *solanago.Transaction) (solanago.Signature, error) {
	sig, err := c.rpc.SendTransactionWithOpts(ctx, tx, rpc.TransactionOpts{
		SkipPreflight:       false,
		PreflightCommitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		return solanago.Signature{}, fmt.Errorf("send transaction: %w", err)
	}

	// Poll for confirmation with exponential backoff (500ms → 1s → 2s → 2s)
	delay := 500 * time.Millisecond
	maxDelay := 2 * time.Second
	deadline := time.After(60 * time.Second)

	for {
		select {
		case <-ctx.Done():
			return sig, ctx.Err()
		case <-deadline:
			return sig, fmt.Errorf("confirmation timeout for %s", sig)
		case <-time.After(delay):
			statuses, err := c.rpc.GetSignatureStatuses(ctx, false, sig)
			if err != nil {
				continue // transient RPC error, retry
			}
			if len(statuses.Value) == 0 || statuses.Value[0] == nil {
				continue // not yet visible
			}
			status := statuses.Value[0]
			if status.Err != nil {
				return sig, fmt.Errorf("transaction %s failed: %v", sig, status.Err)
			}
			if status.ConfirmationStatus == rpc.ConfirmationStatusConfirmed ||
				status.ConfirmationStatus == rpc.ConfirmationStatusFinalized {
				return sig, nil
			}
			// Back off
			if delay < maxDelay {
				delay *= 2
				if delay > maxDelay {
					delay = maxDelay
				}
			}
		}
	}
}

// RPC returns the underlying RPC client for advanced use cases.
func (c *SolanaClient) RPC() *rpc.Client {
	return c.rpc
}
