CREATE TABLE IF NOT EXISTS vendor_registry (
    id                  TEXT PRIMARY KEY,
    domain              TEXT NOT NULL UNIQUE,
    supported_standards JSONB NOT NULL DEFAULT '[]',
    success_rate        NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    avg_latency_ms      INT NOT NULL DEFAULT 0,
    uptime_pct          NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    total_payments      INT NOT NULL DEFAULT 0,
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_vendor_registry_domain ON vendor_registry (domain);
