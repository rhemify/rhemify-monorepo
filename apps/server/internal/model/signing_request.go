package model

type SigningRequest struct {
	ID                    string      `json:"id"`
	AgentID               string      `json:"agent_id"`
	FleetID               string      `json:"fleet_id"`
	DWalletID             string      `json:"dwallet_id"`
	TargetChain           string      `json:"target_chain"`            // "base" | "arbitrum" | "ethereum"
	TargetAddress         string      `json:"target_address"`
	Token                 string      `json:"token"`
	Amount                float64     `json:"amount"`
	Status                string      `json:"status"`                  // "pending" | "approved" | "rejected" | "signed" | "broadcast" | "confirmed" | "failed"
	IntelligenceDecision  interface{} `json:"intelligence_decision,omitempty"`
	RejectionReason       string      `json:"rejection_reason,omitempty"`
	IkaSignature          string      `json:"ika_signature,omitempty"`
	TargetTxHash          string      `json:"target_tx_hash,omitempty"`
	TraceID               string      `json:"trace_id,omitempty"`
	CreatedAt             float64     `json:"created_at"`
	ResolvedAt            float64     `json:"resolved_at,omitempty"`
}
