PRAGMA foreign_keys = OFF;

CREATE TABLE contributions_v2 (
  id TEXT PRIMARY KEY,
  reading_operation_id TEXT REFERENCES reading_operations(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  amount_hkd INTEGER NOT NULL CHECK (amount_hkd BETWEEN 0 AND 888),
  status TEXT NOT NULL CHECK (status IN ('free', 'checkout_created', 'paid', 'cancelled', 'expired', 'refunded', 'failed')),
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  paid_at INTEGER,
  refunded_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO contributions_v2 SELECT * FROM contributions;
DROP TABLE contributions;
ALTER TABLE contributions_v2 RENAME TO contributions;

CREATE INDEX contributions_user_idx ON contributions(user_id, created_at DESC);
CREATE INDEX contributions_status_idx ON contributions(status, updated_at);
CREATE INDEX contributions_reading_idx ON contributions(reading_operation_id, created_at DESC);

PRAGMA foreign_keys = ON;
