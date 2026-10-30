-- Additive and repeatable: preserve existing FAROS tables and JSONB accounts.
CREATE TABLE IF NOT EXISTS faros_users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS faros_users_email_normalized ON faros_users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS faros_users_google_sub ON faros_users ((data->>'googleSub')) WHERE data->>'googleSub' IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS faros_users_microsoft_oid ON faros_users ((data->>'microsoftOid')) WHERE data->>'microsoftOid' IS NOT NULL;

CREATE TABLE IF NOT EXISTS faros_sessions (
  token VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_faros_sessions_user_id ON faros_sessions(user_id);

CREATE TABLE IF NOT EXISTS faros_events (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128),
  event_type VARCHAR(128),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One-use OAuth state and verified onboarding tickets shared across instances.
CREATE TABLE IF NOT EXISTS faros_auth_flows (
  token_hash VARCHAR(64) PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,
  data JSONB NOT NULL,
  expires_at BIGINT NOT NULL
);
