-- Additive: existing accounts, portfolios and sessions remain unchanged.
CREATE TABLE IF NOT EXISTS faros_email_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES faros_users(id) ON DELETE CASCADE,
  purpose VARCHAR(24) NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS faros_email_tokens_user ON faros_email_tokens(user_id, purpose);

CREATE TABLE IF NOT EXISTS faros_email_rate_limits (
  bucket_hash VARCHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at BIGINT NOT NULL
);
