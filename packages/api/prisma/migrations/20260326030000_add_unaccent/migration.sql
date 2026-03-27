-- Enable unaccent extension for accent-insensitive search ("flavio" matches "Flávio")
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper IMMUTABLE em plpgsql com schema explícito para evitar problemas de search_path
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE plpgsql IMMUTABLE STRICT
  SET search_path = public
AS $$
BEGIN
  RETURN public.unaccent($1);
END;
$$;

-- Index para buscas accent-insensitive no nome do candidato
CREATE INDEX IF NOT EXISTS idx_candidates_name_unaccent
  ON "Candidate" (immutable_unaccent(lower(name)));
