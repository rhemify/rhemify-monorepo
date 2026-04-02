package model

import "time"

type VendorRegistry struct {
	ID                 string    `json:"id" db:"id"`
	Domain             string    `json:"domain" db:"domain"`
	SupportedStandards string    `json:"supported_standards" db:"supported_standards"` // JSON array
	SuccessRate        float64   `json:"success_rate" db:"success_rate"`
	AvgLatencyMs       int       `json:"avg_latency_ms" db:"avg_latency_ms"`
	UptimePct          float64   `json:"uptime_pct" db:"uptime_pct"`
	TotalPayments      int       `json:"total_payments" db:"total_payments"`
	LastSeenAt         time.Time `json:"last_seen_at" db:"last_seen_at"`
	CreatedAt          time.Time `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time `json:"updated_at" db:"updated_at"`
}