package model

// FleetStats is the response shape for GET /api/fleet/stats.
type FleetStats struct {
	ActiveAgents    int     `json:"active_agents"`
	TotalSpentToday float64 `json:"total_spent_today"`
	TasksCompleted  int     `json:"tasks_completed"`
	BlockedAgents   int     `json:"blocked_agents"`
	TotalEvents     int     `json:"total_events"`
	BlockedEvents   int     `json:"blocked_events"`
}

// Agent is the response shape for fleet agent listings.
type Agent struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	Department      string  `json:"department"`
	Status          string  `json:"status"` // running | paused | frozen
	SpentToday      float64 `json:"spent_today"`
	DailyLimit      float64 `json:"daily_limit"`
	TasksCompleted  int     `json:"tasks_completed"`
	PrimaryStandard string  `json:"primary_standard"`
}

// PaginatedResponse wraps any list endpoint with pagination metadata.
type PaginatedResponse[T any] struct {
	Data    []T  `json:"data"`
	Total   int  `json:"total"`
	Page    int  `json:"page"`
	PerPage int  `json:"per_page"`
	HasMore bool `json:"has_more"`
}