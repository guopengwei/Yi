PRAGMA foreign_keys = ON;

-- Better Auth core schema. Dates are milliseconds since Unix epoch.
CREATE TABLE "user" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  emailVerified INTEGER NOT NULL DEFAULT 0 CHECK (emailVerified IN (0, 1)),
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_id_idx ON session(userId);
CREATE INDEX session_expires_at_idx ON session(expiresAt);

CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  UNIQUE(providerId, accountId)
);
CREATE INDEX account_user_id_idx ON account(userId);

CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX verification_identifier_idx ON verification(identifier);
CREATE INDEX verification_expires_at_idx ON verification(expiresAt);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deletion_pending')),
  locale TEXT NOT NULL DEFAULT 'zh-HK' CHECK (locale IN ('zh-HK', 'zh-CN', 'en')),
  font_size TEXT NOT NULL DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large')),
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TRIGGER user_create_profile
AFTER INSERT ON "user"
BEGIN
  INSERT INTO profiles(user_id, created_at, updated_at)
  VALUES (NEW.id, NEW.createdAt, NEW.updatedAt);
END;

CREATE TABLE reading_operations (
  id TEXT PRIMARY KEY,
  client_request_id TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  guest_id_hash TEXT,
  request_fingerprint TEXT NOT NULL,
  casting_method TEXT NOT NULL CHECK (casting_method IN ('three-number@1', 'three-coin@1', 'secure-random@1')),
  question_text TEXT,
  question_kind TEXT NOT NULL CHECK (question_kind IN ('none', 'question')),
  timezone TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  reflection_json TEXT,
  source_snapshot_json TEXT,
  safety_json TEXT NOT NULL,
  contribution_amount_hkd INTEGER CHECK (contribution_amount_hkd BETWEEN 0 AND 888),
  status TEXT NOT NULL CHECK (status IN ('awaiting_contribution', 'payment_pending', 'ready', 'failed', 'expired')),
  prompt_version TEXT,
  model_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER,
  UNIQUE(identity_key, client_request_id)
);
CREATE INDEX reading_operations_identity_idx ON reading_operations(identity_key, created_at DESC);
CREATE INDEX reading_operations_user_idx ON reading_operations(user_id, created_at DESC);
CREATE INDEX reading_operations_expiry_idx ON reading_operations(expires_at);
CREATE INDEX reading_operations_status_idx ON reading_operations(status, updated_at);

CREATE TABLE contributions (
  id TEXT PRIMARY KEY,
  reading_operation_id TEXT NOT NULL REFERENCES reading_operations(id) ON DELETE CASCADE,
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
CREATE INDEX contributions_user_idx ON contributions(user_id, created_at DESC);
CREATE INDEX contributions_status_idx ON contributions(status, updated_at);
CREATE INDEX contributions_reading_idx ON contributions(reading_operation_id, created_at DESC);

CREATE TABLE stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  livemode INTEGER NOT NULL CHECK (livemode IN (0, 1)),
  processed_at INTEGER NOT NULL
);

CREATE TABLE archived_readings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  reading_operation_id TEXT NOT NULL UNIQUE REFERENCES reading_operations(id) ON DELETE CASCADE,
  title TEXT,
  question_text TEXT,
  facts_json TEXT NOT NULL,
  reflection_json TEXT,
  safety_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX archived_readings_user_idx ON archived_readings(user_id, created_at DESC);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  archive_id TEXT NOT NULL REFERENCES archived_readings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX notes_archive_idx ON notes(archive_id, updated_at DESC);
CREATE INDEX notes_user_idx ON notes(user_id, updated_at DESC);

CREATE VIRTUAL TABLE history_fts USING fts5(
  archive_id UNINDEXED,
  user_id UNINDEXED,
  content,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER archived_readings_fts_insert
AFTER INSERT ON archived_readings
BEGIN
  INSERT INTO history_fts(archive_id, user_id, content)
  VALUES (NEW.id, NEW.user_id, coalesce(NEW.title, '') || ' ' || coalesce(NEW.question_text, '') || ' ' || NEW.facts_json || ' ' || coalesce(NEW.reflection_json, ''));
END;

CREATE TRIGGER archived_readings_fts_update
AFTER UPDATE ON archived_readings
BEGIN
  DELETE FROM history_fts WHERE archive_id = OLD.id;
  INSERT INTO history_fts(archive_id, user_id, content)
  VALUES (NEW.id, NEW.user_id, coalesce(NEW.title, '') || ' ' || coalesce(NEW.question_text, '') || ' ' || NEW.facts_json || ' ' || coalesce(NEW.reflection_json, ''));
END;

CREATE TRIGGER archived_readings_fts_delete
AFTER DELETE ON archived_readings
BEGIN
  DELETE FROM history_fts WHERE archive_id = OLD.id;
END;

CREATE TRIGGER notes_fts_insert
AFTER INSERT ON notes
BEGIN
  UPDATE history_fts
  SET content = content || ' ' || NEW.body
  WHERE archive_id = NEW.archive_id;
END;

CREATE TRIGGER notes_fts_update
AFTER UPDATE ON notes
BEGIN
  DELETE FROM history_fts WHERE archive_id = NEW.archive_id;
  INSERT INTO history_fts(archive_id, user_id, content)
  SELECT ar.id, ar.user_id,
    coalesce(ar.title, '') || ' ' || coalesce(ar.question_text, '') || ' ' || ar.facts_json || ' ' || coalesce(ar.reflection_json, '') || ' ' || coalesce(group_concat(n.body, ' '), '')
  FROM archived_readings ar LEFT JOIN notes n ON n.archive_id = ar.id
  WHERE ar.id = NEW.archive_id GROUP BY ar.id;
END;

CREATE TRIGGER notes_fts_delete
AFTER DELETE ON notes
BEGIN
  DELETE FROM history_fts WHERE archive_id = OLD.archive_id;
  INSERT INTO history_fts(archive_id, user_id, content)
  SELECT ar.id, ar.user_id,
    coalesce(ar.title, '') || ' ' || coalesce(ar.question_text, '') || ' ' || ar.facts_json || ' ' || coalesce(ar.reflection_json, '') || ' ' || coalesce(group_concat(n.body, ' '), '')
  FROM archived_readings ar LEFT JOIN notes n ON n.archive_id = ar.id
  WHERE ar.id = OLD.archive_id GROUP BY ar.id;
END;

CREATE TABLE chat_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  archive_id TEXT NOT NULL REFERENCES archived_readings(id) ON DELETE CASCADE,
  reading_context_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX chat_conversations_owner_idx ON chat_conversations(user_id, updated_at DESC);

CREATE TABLE share_snapshots (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  archive_id TEXT NOT NULL REFERENCES archived_readings(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  snapshot_json TEXT NOT NULL,
  include_reflection INTEGER NOT NULL CHECK (include_reflection IN (0, 1)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX share_owner_idx ON share_snapshots(owner_user_id, created_at DESC);
CREATE INDEX share_expiry_idx ON share_snapshots(expires_at, revoked_at);

CREATE TABLE ai_operations (
  id TEXT PRIMARY KEY,
  reading_operation_id TEXT REFERENCES reading_operations(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  identity_key TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('reflection', 'chat')),
  model_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL,
  safety_outcome TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  spend_micros INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_operations_day_idx ON ai_operations(created_at, operation_kind);
CREATE INDEX ai_operations_identity_idx ON ai_operations(identity_key, created_at DESC);

CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,
  identity_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(bucket, identity_hash, window_start)
);
CREATE INDEX rate_limits_expiry_idx ON rate_limits(expires_at);

CREATE TABLE contact_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  locale TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  created_at INTEGER NOT NULL
);
CREATE INDEX contact_created_idx ON contact_submissions(created_at DESC);

CREATE TABLE account_exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_events_created_idx ON audit_events(created_at DESC);

CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO app_config(key, value, updated_at) VALUES
  ('global_ai_enabled', 'false', unixepoch() * 1000),
  ('global_daily_token_budget', '250000', unixepoch() * 1000),
  ('global_daily_spend_micros', '10000000', unixepoch() * 1000),
  ('global_ai_max_concurrency', '8', unixepoch() * 1000);
