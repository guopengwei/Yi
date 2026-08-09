ALTER TABLE reading_operations
  ADD COLUMN ai_consent_granted INTEGER NOT NULL DEFAULT 0
  CHECK (ai_consent_granted IN (0, 1));

ALTER TABLE reading_operations
  ADD COLUMN ai_consent_included_question INTEGER NOT NULL DEFAULT 0
  CHECK (ai_consent_included_question IN (0, 1));

ALTER TABLE reading_operations
  ADD COLUMN ai_consent_included_source_material INTEGER NOT NULL DEFAULT 0
  CHECK (ai_consent_included_source_material IN (0, 1));

-- Existing reflections already required explicit facts consent. Preserve that
-- consent and its known question scope; legacy source scope stays narrowed off.
UPDATE reading_operations
SET ai_consent_granted = 1,
    ai_consent_included_question = reflection_included_question
WHERE reflection_json IS NOT NULL;
