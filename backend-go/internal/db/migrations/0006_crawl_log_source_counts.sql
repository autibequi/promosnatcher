-- Add source_counts JSON column to crawl_log
-- This replaces hard-coded ml_count and amz_count with a generic map
-- Legacy columns are kept for 30 days to maintain backward compatibility

ALTER TABLE crawl_log ADD COLUMN source_counts TEXT;

-- Backfill existing rows with source_counts JSON from the legacy columns
-- Format: {"ml": <ml_count>, "amz": <amz_count>}
UPDATE crawl_log SET source_counts = '{"ml":' || ml_count || ',"amz":' || amz_count || '}';
