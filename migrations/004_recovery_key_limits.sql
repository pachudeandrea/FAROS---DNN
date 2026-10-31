-- Only recovery throttling is added. Existing accounts and sessions stay intact.
CREATE TABLE IF NOT EXISTS faros_recovery_limits (
  bucket_hash VARCHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at BIGINT NOT NULL
);
