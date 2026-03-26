-- AlterTable: add camaraId and senadoId to Candidate
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "camaraId" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "senadoId" TEXT;

-- CreateUniqueIndex (only if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS "Candidate_camaraId_key" ON "Candidate"("camaraId");
CREATE UNIQUE INDEX IF NOT EXISTS "Candidate_senadoId_key" ON "Candidate"("senadoId");
