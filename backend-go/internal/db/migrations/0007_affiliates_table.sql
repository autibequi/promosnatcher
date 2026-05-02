CREATE TABLE IF NOT EXISTS affiliates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL REFERENCES sources(id),
    name TEXT NOT NULL,
    tracking_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_affiliates_source ON affiliates(source_id, active);

-- Backfill from AppConfig
INSERT INTO affiliates (source_id, name, tracking_id, active)
SELECT 'ml', 'default', ml_affiliate_tool_id, 1 FROM appconfig
WHERE ml_affiliate_tool_id IS NOT NULL AND ml_affiliate_tool_id != '';

INSERT INTO affiliates (source_id, name, tracking_id, active)
SELECT 'amz', 'default', amz_tracking_id, 1 FROM appconfig
WHERE amz_tracking_id IS NOT NULL AND amz_tracking_id != '';
