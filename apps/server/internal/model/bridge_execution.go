package model

import "time"

type BridgeExecution struct {
	ID             string    `json:"id" db:"id"`
	PaymentEventID string    `json:"payment_event_id" db:"payment_event_id"`
	Protocol       string    `json:"protocol" db:"protocol"` // cctp | relay
	SourceChain    string    `json:"source_chain" db:"source_chain"`
	DestChain      string    `json:"dest_chain" db:"dest_chain"`
	SourceToken    string    `json:"source_token" db:"source_token"`
	DestToken      string    `json:"dest_token" db:"dest_token"`
	AmountIn       float64   `json:"amount_in" db:"amount_in"`
	AmountOut      float64   `json:"amount_out" db:"amount_out"`
	FeePaid        float64   `json:"fee_paid" db:"fee_paid"`
	LatencyMs      int       `json:"latency_ms" db:"latency_ms"`
	Status         string    `json:"status" db:"status"` // pending | completed | failed
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}