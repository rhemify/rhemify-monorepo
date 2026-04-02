package model

import "time"

type PaymentEvent struct {
	ID             string    `json:"id" db:"id"`
	AgentID        string    `json:"agent_id" db:"agent_id"`
	FleetID        string    `json:"fleet_id" db:"fleet_id"`
	Standard       string    `json:"standard" db:"standard"`
	Amount         float64   `json:"amount" db:"amount"`
	Token          string    `json:"token" db:"token"`
	Chain          string    `json:"chain" db:"chain"`
	Domain         string    `json:"domain" db:"domain"`
	Outcome        string    `json:"outcome" db:"outcome"` // success | rejected | failed
	InstrumentType string    `json:"instrument_type" db:"instrument_type"`
	TraceID        string    `json:"trace_id" db:"trace_id"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}
