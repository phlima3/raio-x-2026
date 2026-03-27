-- Migration: add_approval_rate_party_history
-- Adds approvalRate and partyHistory to Candidate

ALTER TABLE "Candidate"
  ADD COLUMN IF NOT EXISTS "approvalRate"  INTEGER,
  ADD COLUMN IF NOT EXISTS "partyHistory"  TEXT[] NOT NULL DEFAULT '{}';
