CREATE TABLE IF NOT EXISTS "OfficialDatasetRecord" (
  "id" TEXT NOT NULL,
  "source" "DataSource" NOT NULL,
  "datasetKind" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "electionYear" INTEGER,
  "payload" JSONB NOT NULL,
  "candidateId" TEXT,
  "sourceDocumentId" TEXT NOT NULL,
  "syncRunId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfficialDatasetRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OfficialDatasetRecord_source_datasetKind_externalId_key"
  ON "OfficialDatasetRecord"("source", "datasetKind", "externalId");
CREATE INDEX IF NOT EXISTS "OfficialDatasetRecord_candidateId_idx"
  ON "OfficialDatasetRecord"("candidateId");
CREATE INDEX IF NOT EXISTS "OfficialDatasetRecord_sourceDocumentId_idx"
  ON "OfficialDatasetRecord"("sourceDocumentId");
CREATE INDEX IF NOT EXISTS "OfficialDatasetRecord_syncRunId_idx"
  ON "OfficialDatasetRecord"("syncRunId");
CREATE INDEX IF NOT EXISTS "OfficialDatasetRecord_datasetKind_electionYear_idx"
  ON "OfficialDatasetRecord"("datasetKind", "electionYear");

DO $$ BEGIN
  ALTER TABLE "OfficialDatasetRecord"
    ADD CONSTRAINT "OfficialDatasetRecord_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OfficialDatasetRecord"
    ADD CONSTRAINT "OfficialDatasetRecord_sourceDocumentId_fkey"
    FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OfficialDatasetRecord"
    ADD CONSTRAINT "OfficialDatasetRecord_syncRunId_fkey"
    FOREIGN KEY ("syncRunId") REFERENCES "DataSyncRun"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
