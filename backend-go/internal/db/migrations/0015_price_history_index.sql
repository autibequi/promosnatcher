CREATE INDEX IF NOT EXISTS ix_price_history_variant_recorded
  ON price_history_v2(variant_id, recorded_at DESC);
