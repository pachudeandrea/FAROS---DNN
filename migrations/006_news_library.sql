CREATE TABLE IF NOT EXISTS faros_news_library (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES faros_users(id) ON DELETE CASCADE,
  news JSONB NOT NULL,
  source_urls TEXT[] NOT NULL,
  published_day DATE NOT NULL,
  saved_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS faros_news_library_owner_day_idx ON faros_news_library(user_id, published_day DESC, id);
CREATE INDEX IF NOT EXISTS faros_news_library_urls_idx ON faros_news_library USING GIN(source_urls);
CREATE INDEX IF NOT EXISTS faros_news_library_saved_idx ON faros_news_library(user_id, saved_at DESC) WHERE saved_at IS NOT NULL;
