-- Recovery codes do not affect existing accounts, portfolios or sessions.
CREATE TABLE IF NOT EXISTS faros_password_reset_codes (
  email_hash VARCHAR(64) PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,
  user_id VARCHAR(128) REFERENCES faros_users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS faros_password_reset_codes_user ON faros_password_reset_codes(user_id);
