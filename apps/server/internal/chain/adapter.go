package chain

import "context"

// ChainAdapter abstracts interaction with an EVM-compatible chain.
type ChainAdapter interface {
	// Chain returns the chain identifier (e.g., "base", "ethereum", "arbitrum").
	Chain() string

	// GetBalance returns the token balance for an address.
	// token is the token symbol (e.g., "ETH", "USDC").
	GetBalance(ctx context.Context, address string, token string) (float64, error)

	// Broadcast submits a signed transaction to the chain.
	// Returns the transaction hash.
	Broadcast(ctx context.Context, signedTx []byte) (string, error)

	// IsConfirmed checks whether a transaction has been confirmed.
	IsConfirmed(ctx context.Context, txHash string) (bool, error)
}
