package engine

// VendorStats is the derived context for vendor health rules (VH-1, VH-2).
// Computed from a sliding window of the last 50 events within 24h.
type VendorStats struct {
	Domain         string
	SuccessRate    float64  // sliding window success rate
	AvgLatencyMs   float64  // from vendor_registry
	EventCount     int64    // events in sliding window
	FailureStreak  int      // consecutive failures from most recent
	Last10Outcomes []string // last 10 outcome strings
	IsBlocked      bool
	BlockedUntil   float64 // epoch ms, 0 = permanent/not set
	BlockCount24h  int64
}

// AgentAggregates is derived context for agent spend rules (SA-1, SA-2).
type AgentAggregates struct {
	AgentID     string
	DailySpend  float64
	AvgDaily7d  float64
	AvgTxAmount float64
	TotalEvents int64
	ActiveDays  int64
}

// FleetAggregates is derived context for fleet-level rules (SA-3).
type FleetAggregates struct {
	FleetID     string
	HourlySpend float64
	AvgHourly7d float64
}

// BridgeInfo is extracted from the payment trace for bridge rules (RO-1).
type BridgeInfo struct {
	BridgeCostPct float64
	BridgeCostAbs float64
	Protocol      string
	ChainFrom     string
	ChainTo       string
}

// EvalContext holds all derived data needed to evaluate rules.
// Built once per evaluation; shared across all rules.
type EvalContext struct {
	Vendor     *VendorStats     // nil if no domain on event
	Agent      *AgentAggregates // nil if agent not yet in aggregates
	Fleet      *FleetAggregates // nil if fleet not yet in aggregates
	Bridge     *BridgeInfo      // nil if no bridge was used
	EdgeCount  int64            // payments from this agent to this domain
	EdgeAvgPmt float64          // avg payment amount for this (agent, domain) pair
}
