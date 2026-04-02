package model

import "time"

type PaymentTrace struct {
	ID                     string    `json:"id" db:"id"`
	PaymentEventID         string    `json:"payment_event_id" db:"payment_event_id"`
	AgentTaskContext       string    `json:"agent_task_context" db:"agent_task_context"`
	Trigger402Raw          string    `json:"trigger_402_raw" db:"trigger_402_raw"`
	AlternativesEvaluated  string    `json:"alternatives_evaluated" db:"alternatives_evaluated"`
	PolicyRulesFired       string    `json:"policy_rules_fired" db:"policy_rules_fired"`
	InstrumentSelectionLog string    `json:"instrument_selection_log" db:"instrument_selection_log"`
	Confidence             string    `json:"confidence" db:"confidence"` // high | medium | low
	ReplaySnapshot         string    `json:"replay_snapshot" db:"replay_snapshot"`
	CreatedAt              time.Time `json:"created_at" db:"created_at"`
}