-- Expand-only migration for the official-first electoral and legislative model.
-- Legacy tables and columns are intentionally retained for rollback compatibility.

ALTER TYPE "Position" ADD VALUE IF NOT EXISTS 'PRIMEIRO_SUPLENTE';
ALTER TYPE "Position" ADD VALUE IF NOT EXISTS 'SEGUNDO_SUPLENTE';
ALTER TYPE "Position" ADD VALUE IF NOT EXISTS 'DEPUTADO_DISTRITAL';

DO $$ BEGIN
  CREATE TYPE "DataSource" AS ENUM (
    'EDITORIAL', 'TSE', 'CAMARA', 'SENADO', 'OFFICIAL_DOCUMENT',
    'CANDIDATE_SITE', 'NEWS', 'MIGRATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OfficialCandidacyStatus" AS ENUM (
    'ELIGIBLE', 'INELIGIBLE', 'PENDING', 'CANCELLED', 'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MandateHouse" AS ENUM ('CAMARA', 'SENADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'NOOP', 'PARTIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewItemKind" AS ENUM (
    'IDENTITY_AMBIGUITY', 'CANDIDACY_CONFLICT', 'DUPLICATE_PERSON', 'SOURCE_DATA_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewItemStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SourceDocumentType" AS ENUM (
    'CAMPAIGN_PROGRAM', 'CANDIDACY_ATTACHMENT', 'TSE_RESOURCE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentExtractionStatus" AS ENUM ('PENDING', 'EXTRACTED', 'NEEDS_OCR', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProposalOrigin" AS ENUM ('EDITORIAL', 'OFFICIAL_DOCUMENT', 'AI_EXTRACTION', 'LEGACY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Person" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "socialName" TEXT,
  "normalizedName" TEXT NOT NULL,
  "camaraId" TEXT,
  "senadoId" TEXT,
  "dataSource" "DataSource" NOT NULL DEFAULT 'EDITORIAL',
  "sourceUrl" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DataSyncRun" (
  "id" TEXT NOT NULL,
  "source" "DataSource" NOT NULL,
  "kind" TEXT NOT NULL,
  "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "metrics" JSONB,
  "error" TEXT,
  "sourceUrl" TEXT,
  "checksum" TEXT,
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataSyncRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "personId" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "electionId" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "isOfficial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "officialStatus" "OfficialCandidacyStatus";
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "officialStatusRaw" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "dataSource" "DataSource" NOT NULL DEFAULT 'EDITORIAL';
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "syncRunId" TEXT;

UPDATE "Candidate"
SET
  "isOfficial" = ("tseId" IS NOT NULL),
  "dataSource" = CASE
    WHEN "tseId" IS NOT NULL THEN 'TSE'::"DataSource"
    WHEN "position" IN ('PRESIDENTE', 'GOVERNADOR') THEN 'EDITORIAL'::"DataSource"
    ELSE 'MIGRATION'::"DataSource"
  END,
  "isPublished" = CASE
    WHEN "position" IN ('PRESIDENTE', 'GOVERNADOR') THEN true
    WHEN "position" = 'SENADOR' AND "tseId" IS NOT NULL THEN true
    ELSE false
  END;

CREATE TABLE IF NOT EXISTS "Mandate" (
  "id" TEXT NOT NULL,
  "source" "DataSource" NOT NULL,
  "externalId" TEXT NOT NULL,
  "legislatureId" TEXT NOT NULL,
  "house" "MandateHouse" NOT NULL,
  "role" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "party" TEXT NOT NULL,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "sourceUrl" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "personId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LegislativeBill" (
  "id" TEXT NOT NULL,
  "source" "DataSource" NOT NULL,
  "externalId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "summary" TEXT,
  "status" "ProposalStatus" NOT NULL DEFAULT 'SUBMITTED',
  "introducedAt" TIMESTAMP(3),
  "url" TEXT,
  "tags" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegislativeBill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LegislativeBillAuthor" (
  "id" TEXT NOT NULL,
  "legislativeBillId" TEXT NOT NULL,
  "mandateId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegislativeBillAuthor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SourceDocument" (
  "id" TEXT NOT NULL,
  "source" "DataSource" NOT NULL,
  "type" "SourceDocumentType" NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "contentType" TEXT,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "text" TEXT,
  "extractionStatus" "DocumentExtractionStatus" NOT NULL DEFAULT 'PENDING',
  "extractionError" TEXT,
  "metadata" JSONB,
  "candidateId" TEXT,
  "syncRunId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "origin" "ProposalOrigin" NOT NULL DEFAULT 'EDITORIAL';
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT;

UPDATE "Proposal"
SET "isPublished" = false, "origin" = 'LEGACY'::"ProposalOrigin"
WHERE lower("source") IN ('camara', 'senado');

ALTER TABLE "VotingRecord" ALTER COLUMN "candidateId" DROP NOT NULL;
ALTER TABLE "VotingRecord" ADD COLUMN IF NOT EXISTS "personId" TEXT;
ALTER TABLE "VotingRecord" ADD COLUMN IF NOT EXISTS "mandateId" TEXT;
ALTER TABLE "VotingRecord" ADD COLUMN IF NOT EXISTS "legislativeBillId" TEXT;

CREATE TABLE IF NOT EXISTS "ReviewItem" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "kind" "ReviewItemKind" NOT NULL,
  "status" "ReviewItemStatus" NOT NULL DEFAULT 'OPEN',
  "source" "DataSource" NOT NULL,
  "reason" TEXT NOT NULL,
  "officialRecordId" TEXT,
  "payload" JSONB,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "candidateId" TEXT,
  "personId" TEXT,
  "syncRunId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Person_camaraId_key" ON "Person"("camaraId");
CREATE UNIQUE INDEX IF NOT EXISTS "Person_senadoId_key" ON "Person"("senadoId");
CREATE INDEX IF NOT EXISTS "Person_normalizedName_idx" ON "Person"("normalizedName");
CREATE INDEX IF NOT EXISTS "Candidate_personId_idx" ON "Candidate"("personId");
CREATE INDEX IF NOT EXISTS "Candidate_isPublished_position_electionYear_idx" ON "Candidate"("isPublished", "position", "electionYear");
CREATE INDEX IF NOT EXISTS "Candidate_dataSource_idx" ON "Candidate"("dataSource");
CREATE INDEX IF NOT EXISTS "Candidate_syncRunId_idx" ON "Candidate"("syncRunId");
CREATE UNIQUE INDEX IF NOT EXISTS "Mandate_source_externalId_legislatureId_key" ON "Mandate"("source", "externalId", "legislatureId");
CREATE INDEX IF NOT EXISTS "Mandate_personId_idx" ON "Mandate"("personId");
CREATE INDEX IF NOT EXISTS "Mandate_house_isCurrent_idx" ON "Mandate"("house", "isCurrent");
CREATE UNIQUE INDEX IF NOT EXISTS "LegislativeBill_source_externalId_key" ON "LegislativeBill"("source", "externalId");
CREATE INDEX IF NOT EXISTS "LegislativeBill_introducedAt_idx" ON "LegislativeBill"("introducedAt");
CREATE INDEX IF NOT EXISTS "LegislativeBill_status_idx" ON "LegislativeBill"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "LegislativeBillAuthor_legislativeBillId_mandateId_key" ON "LegislativeBillAuthor"("legislativeBillId", "mandateId");
CREATE INDEX IF NOT EXISTS "LegislativeBillAuthor_mandateId_idx" ON "LegislativeBillAuthor"("mandateId");
CREATE UNIQUE INDEX IF NOT EXISTS "SourceDocument_sha256_key" ON "SourceDocument"("sha256");
CREATE INDEX IF NOT EXISTS "SourceDocument_candidateId_idx" ON "SourceDocument"("candidateId");
CREATE INDEX IF NOT EXISTS "SourceDocument_syncRunId_idx" ON "SourceDocument"("syncRunId");
CREATE INDEX IF NOT EXISTS "SourceDocument_extractionStatus_idx" ON "SourceDocument"("extractionStatus");
CREATE INDEX IF NOT EXISTS "Proposal_isPublished_idx" ON "Proposal"("isPublished");
CREATE INDEX IF NOT EXISTS "Proposal_sourceDocumentId_idx" ON "Proposal"("sourceDocumentId");
CREATE INDEX IF NOT EXISTS "VotingRecord_personId_idx" ON "VotingRecord"("personId");
CREATE INDEX IF NOT EXISTS "VotingRecord_mandateId_idx" ON "VotingRecord"("mandateId");
CREATE INDEX IF NOT EXISTS "VotingRecord_legislativeBillId_idx" ON "VotingRecord"("legislativeBillId");
CREATE UNIQUE INDEX IF NOT EXISTS "VotingRecord_source_externalId_mandateId_key" ON "VotingRecord"("source", "externalId", "mandateId");
CREATE INDEX IF NOT EXISTS "DataSyncRun_source_startedAt_idx" ON "DataSyncRun"("source", "startedAt");
CREATE INDEX IF NOT EXISTS "DataSyncRun_status_idx" ON "DataSyncRun"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewItem_dedupeKey_key" ON "ReviewItem"("dedupeKey");
CREATE INDEX IF NOT EXISTS "ReviewItem_status_kind_idx" ON "ReviewItem"("status", "kind");
CREATE INDEX IF NOT EXISTS "ReviewItem_candidateId_idx" ON "ReviewItem"("candidateId");
CREATE INDEX IF NOT EXISTS "ReviewItem_personId_idx" ON "ReviewItem"("personId");
CREATE INDEX IF NOT EXISTS "ReviewItem_syncRunId_idx" ON "ReviewItem"("syncRunId");

ALTER TABLE "Candidate" DROP CONSTRAINT IF EXISTS "Candidate_personId_fkey";
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Candidate" DROP CONSTRAINT IF EXISTS "Candidate_syncRunId_fkey";
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "DataSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Mandate" DROP CONSTRAINT IF EXISTS "Mandate_personId_fkey";
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegislativeBillAuthor" DROP CONSTRAINT IF EXISTS "LegislativeBillAuthor_legislativeBillId_fkey";
ALTER TABLE "LegislativeBillAuthor" ADD CONSTRAINT "LegislativeBillAuthor_legislativeBillId_fkey" FOREIGN KEY ("legislativeBillId") REFERENCES "LegislativeBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegislativeBillAuthor" DROP CONSTRAINT IF EXISTS "LegislativeBillAuthor_mandateId_fkey";
ALTER TABLE "LegislativeBillAuthor" ADD CONSTRAINT "LegislativeBillAuthor_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceDocument" DROP CONSTRAINT IF EXISTS "SourceDocument_candidateId_fkey";
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SourceDocument" DROP CONSTRAINT IF EXISTS "SourceDocument_syncRunId_fkey";
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "DataSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Proposal" DROP CONSTRAINT IF EXISTS "Proposal_sourceDocumentId_fkey";
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VotingRecord" DROP CONSTRAINT IF EXISTS "VotingRecord_candidateId_fkey";
ALTER TABLE "VotingRecord" ADD CONSTRAINT "VotingRecord_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VotingRecord" DROP CONSTRAINT IF EXISTS "VotingRecord_personId_fkey";
ALTER TABLE "VotingRecord" ADD CONSTRAINT "VotingRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VotingRecord" DROP CONSTRAINT IF EXISTS "VotingRecord_mandateId_fkey";
ALTER TABLE "VotingRecord" ADD CONSTRAINT "VotingRecord_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VotingRecord" DROP CONSTRAINT IF EXISTS "VotingRecord_legislativeBillId_fkey";
ALTER TABLE "VotingRecord" ADD CONSTRAINT "VotingRecord_legislativeBillId_fkey" FOREIGN KEY ("legislativeBillId") REFERENCES "LegislativeBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewItem" DROP CONSTRAINT IF EXISTS "ReviewItem_candidateId_fkey";
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewItem" DROP CONSTRAINT IF EXISTS "ReviewItem_personId_fkey";
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewItem" DROP CONSTRAINT IF EXISTS "ReviewItem_syncRunId_fkey";
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "DataSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
