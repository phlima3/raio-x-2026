-- Status da candidatura presidencial, sincronizado via notícias
-- (confirmado | pre_candidato | cotado | desistiu)
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "candidacyStatus" TEXT;
