package model

import "time"

type PaymentEdge struct {
	ID              string    `json:"id" db:"id"`
	FromAgentID     string    `json:"from_agent_id" db:"from_agent_id"`
	ToService       string    `json:"to_service" db:"to_service"`
	DelegationDepth int       `json:"delegation_depth" db:"delegation_depth"`
	CumulativeSpend float64   `json:"cumulative_spend" db:"cumulative_spend"`
	LastSeenAt      time.Time `json:"last_seen_at" db:"last_seen_at"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
}