CREATE TABLE IF NOT EXISTS payment_edges (
    id               TEXT PRIMARY KEY,
    from_agent_id    TEXT NOT NULL,
    to_service       TEXT NOT NULL,
    delegation_depth INT NOT NULL DEFAULT 0,
    cumulative_spend NUMERIC(18, 8) NOT NULL DEFAULT 0,
    last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_edges_from_agent ON payment_edges (from_agent_id);
CREATE INDEX idx_payment_edges_to_service ON payment_edges (to_service);
CREATE UNIQUE INDEX idx_payment_edges_agent_service ON payment_edges (from_agent_id, to_service);
