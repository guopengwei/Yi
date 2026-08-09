ALTER TABLE reading_operations
  ADD COLUMN reflection_included_source_material INTEGER NOT NULL DEFAULT 0
  CHECK (reflection_included_source_material IN (0, 1));
