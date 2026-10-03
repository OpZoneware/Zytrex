BEGIN;
CREATE TABLE IF NOT EXISTS zytrex_sandbox_sessions (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
  schema_version integer NOT NULL DEFAULT 1,
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS zytrex_sandbox_sessions_expiry ON zytrex_sandbox_sessions (expires_at);
COMMIT;
