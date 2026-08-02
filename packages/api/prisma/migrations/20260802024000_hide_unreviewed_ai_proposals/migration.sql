-- AI-derived campaign claims must remain invisible until an explicit review.
-- Existing editorial rows are intentionally untouched.
UPDATE "Proposal"
SET
  "status" = 'DRAFT'::"ProposalStatus",
  "isPublished" = false,
  "origin" = 'AI_EXTRACTION'::"ProposalOrigin"
WHERE "reviewedAt" IS NULL
  AND "source" IN ('candidate_site', 'news', 'gemini_research');
