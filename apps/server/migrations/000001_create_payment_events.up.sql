CREATE TABLE IF NOT EXISTS payment_events (
    id              TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    fleet_id        TEXT NOT NULL,
    standard        TEXT NOT NULL,  -- x402 | mpp | l402 | ap2
    amount          NUMERIC(18, 8) NOT NULL,
    token           TEXT NOT NULL,
    chain           TEXT NOT NULL,
    domain          TEXT NOT NULL,
    outcome         TEXT NOT NULL,  -- success | rejected | failed
    instrument_type TEXT NOT NULL,
    trace_id        TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_events_agent_id ON payment_events (agent_id);
CREATE INDEX idx_payment_events_fleet_id ON payment_events (fleet_id);
CREATE INDEX idx_payment_events_domain ON payment_events (domain);
CREATE INDEX idx_payment_events_outcome ON payment_events (outcome);
CREATE INDEX idx_payment_events_created_at ON payment_events (created_at);
CREATE INDEX idx_payment_events_trace_id ON payment_events (trace_id);
