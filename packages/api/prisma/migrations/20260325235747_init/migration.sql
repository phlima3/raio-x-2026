-- CreateEnum
CREATE TYPE "Position" AS ENUM ('PRESIDENTE', 'VICE_PRESIDENTE', 'SENADOR', 'DEPUTADO_FEDERAL', 'DEPUTADO_ESTADUAL', 'GOVERNADOR', 'VICE_GOVERNADOR', 'PREFEITO', 'VEREADOR');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_COMMITTEE', 'VOTED', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('YES', 'NO', 'ABSTENTION', 'ABSENT', 'OBSTRUCTION');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "tseId" TEXT,
    "name" TEXT NOT NULL,
    "socialName" TEXT,
    "party" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "coalitionName" TEXT,
    "photoUrl" TEXT,
    "bio" TEXT,
    "bioSummary" TEXT,
    "siteUrl" TEXT,
    "email" TEXT,
    "ballotNumber" INTEGER,
    "electionYear" INTEGER NOT NULL DEFAULT 2026,
    "isIncumbent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "summary" TEXT,
    "category" TEXT,
    "tags" TEXT[],
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "proposedAt" TIMESTAMP(3),
    "url" TEXT,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotingRecord" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "source" TEXT NOT NULL,
    "proposalName" TEXT NOT NULL,
    "proposalUrl" TEXT,
    "voteType" "VoteType" NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL,
    "session" TEXT,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VotingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDeclaration" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "totalValue" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "sourceUrl" TEXT,
    "assets" JSONB,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignFinancing" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "totalReceived" DECIMAL(18,2) NOT NULL,
    "totalSpent" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "sourceUrl" TEXT,
    "donors" JSONB,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignFinancing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_tseId_key" ON "Candidate"("tseId");

-- CreateIndex
CREATE INDEX "Candidate_party_idx" ON "Candidate"("party");

-- CreateIndex
CREATE INDEX "Candidate_state_idx" ON "Candidate"("state");

-- CreateIndex
CREATE INDEX "Candidate_position_idx" ON "Candidate"("position");

-- CreateIndex
CREATE INDEX "Candidate_electionYear_idx" ON "Candidate"("electionYear");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_externalId_key" ON "Proposal"("externalId");

-- CreateIndex
CREATE INDEX "Proposal_candidateId_idx" ON "Proposal"("candidateId");

-- CreateIndex
CREATE INDEX "Proposal_category_idx" ON "Proposal"("category");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE INDEX "VotingRecord_candidateId_idx" ON "VotingRecord"("candidateId");

-- CreateIndex
CREATE INDEX "VotingRecord_votedAt_idx" ON "VotingRecord"("votedAt");

-- CreateIndex
CREATE INDEX "VotingRecord_voteType_idx" ON "VotingRecord"("voteType");

-- CreateIndex
CREATE INDEX "AssetDeclaration_candidateId_idx" ON "AssetDeclaration"("candidateId");

-- CreateIndex
CREATE INDEX "AssetDeclaration_year_idx" ON "AssetDeclaration"("year");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDeclaration_candidateId_year_key" ON "AssetDeclaration"("candidateId", "year");

-- CreateIndex
CREATE INDEX "CampaignFinancing_candidateId_idx" ON "CampaignFinancing"("candidateId");

-- CreateIndex
CREATE INDEX "CampaignFinancing_year_idx" ON "CampaignFinancing"("year");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignFinancing_candidateId_year_key" ON "CampaignFinancing"("candidateId", "year");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingRecord" ADD CONSTRAINT "VotingRecord_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDeclaration" ADD CONSTRAINT "AssetDeclaration_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignFinancing" ADD CONSTRAINT "CampaignFinancing_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
