-- Enable unaccent extension for accent-insensitive search ("flavio" matches "Flávio")
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper IMMUTABLE necessário para usar unaccent() em índice
-- (unaccent() é STABLE por padrão; PostgreSQL exige IMMUTABLE em expressões de índice)
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT unaccent($1);
$$;

-- Index para buscas accent-insensitive no nome do candidato
CREATE INDEX IF NOT EXISTS idx_candidates_name_unaccent
  ON "Candidate" (immutable_unaccent(lower(name)));
