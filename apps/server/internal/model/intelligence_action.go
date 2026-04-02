package model

import "time"

type IntelligenceAction struct {
	ID               string     `json:"id" db:"id"`
	ActionType       string     `json:"action_type" db:"action_type"` // auto_block | auto_flag | auto_alert | recommend | auto_route
	TriggerRule      string     `json:"trigger_rule" db:"trigger_rule"`
	Evidence         string     `json:"evidence" db:"evidence"` // JSON
	Outcome          string     `json:"outcome" db:"outcome"`   // pending | applied | dismissed | reversed
	OperatorOverride *string    `json:"operator_override" db:"operator_override"`
	AgentID          string     `json:"agent_id" db:"agent_id"`
	Domain           string     `json:"domain" db:"domain"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
	ResolvedAt       *time.Time `json:"resolved_at" db:"resolved_at"`
}