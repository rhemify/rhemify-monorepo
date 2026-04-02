package model

import "time"

type PolicyDecision struct {
	ID             string    `json:"id" db:"id"`
	PaymentEventID string    `json:"payment_event_id" db:"payment_event_id"`
	AgentID        string    `json:"agent_id" db:"agent_id"`
	RuleTriggered  string    `json:"rule_triggered" db:"rule_triggered"`
	Decision       string    `json:"decision" db:"decision"` // allow | flag | block
	Threshold      string    `json:"threshold" db:"threshold"`
	ActualValue    string    `json:"actual_value" db:"actual_value"`
	Domain         string    `json:"domain" db:"domain"`
	Standard       string    `json:"standard" db:"standard"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}