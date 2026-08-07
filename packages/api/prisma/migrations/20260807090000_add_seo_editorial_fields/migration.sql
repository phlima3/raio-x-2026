-- Campos auditáveis para status eleitoral, crédito de imagem e quality gate SEO.
-- Todos começam nulos de propósito: nenhum perfil é aprovado editorialmente por migração.
ALTER TABLE "Candidate"
  ADD COLUMN IF NOT EXISTS "personKey" TEXT,
  ADD COLUMN IF NOT EXISTS "runningMateName" TEXT,
  ADD COLUMN IF NOT EXISTS "runningMateParty" TEXT,
  ADD COLUMN IF NOT EXISTS "runningMateSourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "photoSourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "photoLicense" TEXT,
  ADD COLUMN IF NOT EXISTS "bioSourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "candidacyStatusSourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "candidacyStatusVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "materialUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "editorialApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "editorialAuthor" TEXT,
  ADD COLUMN IF NOT EXISTS "editorialReviewer" TEXT;

CREATE TABLE IF NOT EXISTS "CandidateSlugAlias" (
  "slug" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateSlugAlias_pkey" PRIMARY KEY ("slug"),
  CONSTRAINT "CandidateSlugAlias_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CandidateSlugAlias_candidateId_idx"
  ON "CandidateSlugAlias"("candidateId");

-- The previous schema marked Candidate.slug as unique. Remove that implicit
-- index before creating the non-unique lookup index used for legacy records.
DROP INDEX IF EXISTS "Candidate_slug_key";
CREATE INDEX IF NOT EXISTS "Candidate_slug_idx" ON "Candidate"("slug");
CREATE INDEX IF NOT EXISTS "Candidate_personKey_idx" ON "Candidate"("personKey");

-- Scores são derivados. Recalcule-os após aplicar a nova política que exclui
-- rascunhos e propostas sem fonte HTTPS da análise pública.
DELETE FROM "ConsistencyScore";
