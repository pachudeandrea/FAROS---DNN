-- Reuse completed verified queries across serverless instances. No account data.
CREATE TABLE IF NOT EXISTS faros_news_pulse_cache (
  selection_key TEXT NOT NULL,
  hour_key TEXT NOT NULL,
  news JSONB NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (selection_key, hour_key)
);
CREATE INDEX IF NOT EXISTS faros_news_pulse_cache_checked_at ON faros_news_pulse_cache (checked_at DESC);
