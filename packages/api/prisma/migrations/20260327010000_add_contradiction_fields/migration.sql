-- Migration: add_contradiction_fields
-- Adds hasContradiction + contradictionNote to NewsItem

ALTER TABLE "NewsItem"
  ADD COLUMN IF NOT EXISTS "hasContradiction"  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "contradictionNote" TEXT;
