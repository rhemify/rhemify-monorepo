CREATE TABLE IF NOT EXISTS task_attributions (
    id               TEXT PRIMARY KEY,
    agent_id         TEXT NOT NULL,
    task_id          TEXT NOT NULL,
    payment_event_id TEXT NOT NULL REFERENCES payment_events(id),
    outcome          TEXT NOT NULL,  -- success | failure | partial
    cost_contribution NUMERIC(18, 8) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_attributions_agent_id ON task_attributions (agent_id);
CREATE INDEX idx_task_attributions_task_id ON task_attributions (task_id);
CREATE INDEX idx_task_attributions_payment_event ON task_attributions (payment_event_id);
