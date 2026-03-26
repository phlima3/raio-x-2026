-- Enable unaccent extension for accent-insensitive search ("flavio" matches "Flávio")
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Index to speed up unaccent searches on candidate name
CREATE INDEX IF NOT EXISTS idx_candidates_name_unaccent
  ON "Candidate" (unaccent(lower(name)));
