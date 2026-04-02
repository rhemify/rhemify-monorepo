CREATE TABLE IF NOT EXISTS payment_traces (
    id                       TEXT PRIMARY KEY,
    payment_event_id         TEXT NOT NULL REFERENCES payment_events(id),
    agent_task_context       TEXT NOT NULL DEFAULT '',
    trigger_402_raw          TEXT NOT NULL DEFAULT '',
    alternatives_evaluated   JSONB NOT NULL DEFAULT '[]',
    policy_rules_fired       JSONB NOT NULL DEFAULT '[]',
    instrument_selection_log JSONB NOT NULL DEFAULT '{}',
    confidence               TEXT NOT NULL DEFAULT 'low',  -- high | medium | low
    replay_snapshot          JSONB NOT NULL DEFAULT '{}',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_traces_payment_event_id ON payment_traces (payment_event_id);
CREATE INDEX idx_payment_traces_confidence ON payment_traces (confidence);
