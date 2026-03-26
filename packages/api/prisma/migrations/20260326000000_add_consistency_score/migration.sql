-- CreateTable
CREATE TABLE "ConsistencyScore" (
    "id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "contradictions" JSONB,
    "proposalCount" INTEGER NOT NULL DEFAULT 0,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsistencyScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsistencyScore_candidateId_idx" ON "ConsistencyScore"("candidateId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "ConsistencyScore_candidateId_theme_key" ON "ConsistencyScore"("candidateId", "theme");

-- AddForeignKey
ALTER TABLE "ConsistencyScore" ADD CONSTRAINT "ConsistencyScore_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
