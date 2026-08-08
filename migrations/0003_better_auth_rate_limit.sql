-- Better Auth's database-backed limiter is separate from the application's
-- endpoint limiter in `rate_limits` and follows Better Auth's canonical names.
CREATE TABLE rateLimit (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);

CREATE INDEX rateLimit_last_request_idx ON rateLimit(lastRequest);
