package model

type DWallet struct {
	ID              string   `json:"id"`
	FleetID         string   `json:"fleet_id"`
	AgentID         string   `json:"agent_id,omitempty"`
	DWalletType     string   `json:"dwallet_type"`      // "treasury" | "agent"
	DWalletID       string   `json:"dwallet_id"`         // Ika dWallet identifier
	DWalletCapID    string   `json:"dwallet_cap_id"`     // ownership cap (Solana account)
	SupportedChains []string `json:"supported_chains"`   // ["ethereum", "base", "arbitrum"]
	Status          string   `json:"status"`             // "creating" | "active" | "frozen" | "revoked"
	CreatedAt       float64  `json:"created_at"`
}
