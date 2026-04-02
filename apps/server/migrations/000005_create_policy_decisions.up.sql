CREATE TABLE IF NOT EXISTS policy_decisions (
    id               TEXT PRIMARY KEY,
    payment_event_id TEXT NOT NULL REFERENCES payment_events(id),
    agent_id         TEXT NOT NULL,
    rule_triggered   TEXT NOT NULL,
    decision         TEXT NOT NULL,  -- allow | flag | block
    threshold        TEXT NOT NULL DEFAULT '',
    actual_value     TEXT NOT NULL DEFAULT '',
    domain           TEXT NOT NULL DEFAULT '',
    standard         TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policy_decisions_payment_event ON policy_decisions (payment_event_id);
CREATE INDEX idx_policy_decisions_agent_id ON policy_decisions (agent_id);
CREATE INDEX idx_policy_decisions_decision ON policy_decisions (decision);
CREATE INDEX idx_policy_decisions_rule ON policy_decisions (rule_triggered);
