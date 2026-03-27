-- Enable unaccent extension for accent-insensitive search ("flavio" matches "Flávio")
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper IMMUTABLE para usar unaccent() em índice.
-- Usa a forma de 2 argumentos (função C, não SQL wrapper) para evitar problema de inlining.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT public.unaccent('unaccent'::regdictionary, $1);
$$;

-- Index para buscas accent-insensitive no nome do candidato
CREATE INDEX IF NOT EXISTS idx_candidates_name_unaccent
  ON "Candidate" (immutable_unaccent(lower(name)));
