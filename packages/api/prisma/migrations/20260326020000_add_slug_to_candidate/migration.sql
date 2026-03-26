-- Add slug column to Candidate (nullable; populated by seed on startup)
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "slug" TEXT;
