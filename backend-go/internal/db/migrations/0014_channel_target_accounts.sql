CREATE TABLE IF NOT EXISTS channel_target_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id INTEGER NOT NULL REFERENCES channel_target(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES wa_account(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('primary','fallback')),
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(target_id, account_id)
);
CREATE INDEX ix_cta_target ON channel_target_accounts(target_id, priority);

-- Backfill: each ChannelTarget gets 1 row (primary) pointing to the first active WAAccount with matching provider
INSERT OR IGNORE INTO channel_target_accounts (target_id, account_id, role, priority)
SELECT ct.id, wa.id, 'primary', 0
FROM channel_target ct
CROSS JOIN (
  SELECT DISTINCT provider FROM wa_account WHERE active = 1
) p
JOIN wa_account wa ON wa.provider = p.provider AND wa.active = 1
WHERE ct.provider = p.provider
  AND wa.id = (
    SELECT MIN(id) FROM wa_account WHERE provider = ct.provider AND active = 1
  );
