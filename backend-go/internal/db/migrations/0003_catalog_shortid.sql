-- migrate:up
ALTER TABLE catalogvariant ADD COLUMN short_id TEXT;
CREATE INDEX IF NOT EXISTS idx_catalogvariant_shortid ON catalogvariant(short_id);

-- migrate:down
-- noop
