CREATE TABLE operational_errors (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  error_code TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  retryable INTEGER NOT NULL CHECK (retryable IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE INDEX operational_errors_created_idx ON operational_errors(created_at DESC);
