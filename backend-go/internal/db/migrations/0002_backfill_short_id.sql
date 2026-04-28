-- migrate:up
-- Backfill short_id para produtos legacy sem short_id
-- Usa hex(randomblob(4)) como short_id temporário (8 chars hex)
-- O backend pode regenerar com formato base62 se necessário
UPDATE product
SET short_id = lower(hex(randomblob(4)))
WHERE short_id IS NULL OR short_id = '';

-- migrate:down
-- noop
