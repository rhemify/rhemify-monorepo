CREATE TABLE IF NOT EXISTS bridge_executions (
    id               TEXT PRIMARY KEY,
    payment_event_id TEXT NOT NULL REFERENCES payment_events(id),
    protocol         TEXT NOT NULL,  -- cctp | relay
    source_chain     TEXT NOT NULL,
    dest_chain       TEXT NOT NULL,
    source_token     TEXT NOT NULL,
    dest_token       TEXT NOT NULL,
    amount_in        NUMERIC(18, 8) NOT NULL,
    amount_out       NUMERIC(18, 8) NOT NULL,
    fee_paid         NUMERIC(18, 8) NOT NULL DEFAULT 0,
    latency_ms       INT NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | failed
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bridge_executions_payment_event ON bridge_executions (payment_event_id);
CREATE INDEX idx_bridge_executions_status ON bridge_executions (status);
