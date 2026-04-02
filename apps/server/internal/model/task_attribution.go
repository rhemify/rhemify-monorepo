package model

import "time"

type TaskAttribution struct {
	ID             string    `json:"id" db:"id"`
	AgentID        string    `json:"agent_id" db:"agent_id"`
	TaskID         string    `json:"task_id" db:"task_id"`
	PaymentEventID string    `json:"payment_event_id" db:"payment_event_id"`
	Outcome        string    `json:"outcome" db:"outcome"` // success | failure | partial
	CostContrib    float64   `json:"cost_contribution" db:"cost_contribution"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}
