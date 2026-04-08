package engine

// Severity defines how impactful an intelligence action is.
type Severity string

const (
	SeverityLog     Severity = "LOG"
	SeverityFlag    Severity = "FLAG"
	SeverityAlert   Severity = "ALERT"
	SeverityAutoAct Severity = "AUTO_ACT"
)

// Action is produced by a rule when its condition is met.
type Action struct {
	ActionType   string
	Severity     Severity
	TriggerRule  string
	Evidence     map[string]interface{}
	ActionDetail string
	Domain       string
	AgentID      string
	FleetID      string
}

// Rule is the interface every intelligence rule implements.
// Evaluate returns nil if the rule condition is not met.
type Rule interface {
	ID() string
	Evaluate(event map[string]interface{}, ctx *EvalContext) *Action
}
