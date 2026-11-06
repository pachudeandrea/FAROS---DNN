-- Keep account, portfolio and preference data intact. Existing saves keep their original age.
DELETE FROM faros_news_library WHERE saved_at IS NULL OR saved_at <= NOW() - INTERVAL '24 hours';
CREATE INDEX IF NOT EXISTS faros_news_library_saved_expiry ON faros_news_library (user_id, saved_at DESC) WHERE saved_at IS NOT NULL;
