-- Migration: add_news_items
-- Adds the NewsItem table for storing Gemini Search Grounding results

CREATE TABLE IF NOT EXISTS "NewsItem" (
    "id"          TEXT        NOT NULL,
    "headline"    TEXT        NOT NULL,
    "summary"     TEXT        NOT NULL,
    "source"      TEXT,
    "url"         TEXT,
    "topic"       TEXT        NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candidateId" TEXT        NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- FK to Candidate (cascade delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NewsItem_candidateId_fkey'
  ) THEN
    ALTER TABLE "NewsItem"
      ADD CONSTRAINT "NewsItem_candidateId_fkey"
      FOREIGN KEY ("candidateId")
      REFERENCES "Candidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "NewsItem_candidateId_idx" ON "NewsItem"("candidateId");
CREATE INDEX IF NOT EXISTS "NewsItem_topic_idx"       ON "NewsItem"("topic");
CREATE INDEX IF NOT EXISTS "NewsItem_publishedAt_idx" ON "NewsItem"("publishedAt");
