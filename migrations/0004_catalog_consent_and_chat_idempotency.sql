ALTER TABLE reading_operations
  ADD COLUMN reflection_included_question INTEGER NOT NULL DEFAULT 0
  CHECK (reflection_included_question IN (0, 1));

ALTER TABLE archived_readings
  ADD COLUMN reflection_included_question INTEGER NOT NULL DEFAULT 0
  CHECK (reflection_included_question IN (0, 1));

ALTER TABLE chat_conversations
  ADD COLUMN request_fingerprint TEXT;

CREATE TABLE catalog_releases (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'yi-source-catalog@1'),
  content_sha256 TEXT NOT NULL UNIQUE,
  locales_json TEXT NOT NULL,
  rights_evidence_uri TEXT NOT NULL,
  review_status TEXT NOT NULL CHECK (review_status IN ('draft', 'approved', 'withdrawn')),
  approved_by TEXT,
  approved_at INTEGER,
  activated_at INTEGER
);

CREATE UNIQUE INDEX catalog_one_active_release_idx
  ON catalog_releases((1)) WHERE activated_at IS NOT NULL AND review_status = 'approved';

CREATE TABLE source_catalog_entries (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES catalog_releases(id) ON DELETE CASCADE,
  entry_key TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('hexagram', 'line', 'special-line')),
  locale TEXT NOT NULL CHECK (locale IN ('zh-HK', 'zh-CN', 'en')),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 8000),
  provenance_json TEXT NOT NULL,
  rights_status TEXT NOT NULL CHECK (rights_status IN ('public-domain-mark', 'permission', 'commissioned')),
  approval_status TEXT NOT NULL CHECK (approval_status = 'approved'),
  UNIQUE(release_id, entry_key, locale)
);

CREATE INDEX source_catalog_lookup_idx
  ON source_catalog_entries(release_id, locale, entry_key);
