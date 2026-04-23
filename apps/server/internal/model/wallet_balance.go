package model

type WalletBalance struct {
	ID           string  `json:"id"`
	DWalletID    string  `json:"dwallet_id"`
	Chain        string  `json:"chain"`          // "ethereum" | "base" | "arbitrum"
	Token        string  `json:"token"`          // "ETH" | "USDC" | etc.
	Amount       float64 `json:"amount"`
	LastSyncedAt float64 `json:"last_synced_at"`
}
