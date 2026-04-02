CREATE TABLE IF NOT EXISTS intelligence_actions (
    id                TEXT PRIMARY KEY,
    action_type       TEXT NOT NULL,  -- auto_block | auto_flag | auto_alert | recommend | auto_route
    trigger_rule      TEXT NOT NULL,
    evidence          JSONB NOT NULL DEFAULT '{}',
    outcome           TEXT NOT NULL DEFAULT 'pending',  -- pending | applied | dismissed | reversed
    operator_override TEXT,
    agent_id          TEXT NOT NULL,
    domain            TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMPTZ
);

CREATE INDEX idx_intelligence_actions_action_type ON intelligence_actions (action_type);
CREATE INDEX idx_intelligence_actions_agent_id ON intelligence_actions (agent_id);
CREATE INDEX idx_intelligence_actions_outcome ON intelligence_actions (outcome);
CREATE INDEX idx_intelligence_actions_trigger_rule ON intelligence_actions (trigger_rule);
