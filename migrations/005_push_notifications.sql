-- Opt-in Web Push, inboxes, and reminder synchronization are per account.
CREATE TABLE IF NOT EXISTS faros_push_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS faros_push_subscriptions (
  endpoint_hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES faros_users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS faros_push_subscriptions_user ON faros_push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS faros_notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES faros_users(id) ON DELETE CASCADE,
  event_key VARCHAR(128) NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('news', 'reminder', 'test')),
  payload JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  read_at BIGINT,
  UNIQUE (user_id, event_key)
);
CREATE INDEX IF NOT EXISTS faros_notifications_user_date ON faros_notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS faros_push_outbox (
  notification_id VARCHAR(64) NOT NULL REFERENCES faros_notifications(id) ON DELETE CASCADE,
  endpoint_hash VARCHAR(64) NOT NULL REFERENCES faros_push_subscriptions(endpoint_hash) ON DELETE CASCADE,
  delivered_at BIGINT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (notification_id, endpoint_hash)
);
CREATE INDEX IF NOT EXISTS faros_push_outbox_pending ON faros_push_outbox(delivered_at, lease_until);
CREATE TABLE IF NOT EXISTS faros_notification_calendars (
  user_id VARCHAR(128) PRIMARY KEY REFERENCES faros_users(id) ON DELETE CASCADE,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS faros_notification_articles (
  article_key VARCHAR(64) PRIMARY KEY,
  data JSONB NOT NULL,
  reviewed_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS faros_notification_jobs (
  job_key VARCHAR(128) PRIMARY KEY,
  lease_until BIGINT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  completed_at BIGINT
);
CREATE TABLE IF NOT EXISTS faros_notification_limits (
  bucket_hash VARCHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at BIGINT NOT NULL
);
