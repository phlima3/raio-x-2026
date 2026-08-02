import {
  Position,
  PrismaClient,
  ProposalOrigin,
  ProposalStatus,
} from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { persistExtractedProposals } from '../src/processors/proposalExtractor'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

describe('AI proposal review lifecycle', () => {
  beforeEach(async () => {
    await prisma.proposal.deleteMany()
    await prisma.candidate.deleteMany()
  })

  afterAll(async () => {
    await prisma.proposal.deleteMany()
    await prisma.candidate.deleteMany()
    await prisma.$disconnect()
  })

  it('never overwrites a reviewed proposal during source reprocessing', async () => {
    const candidate = await prisma.candidate.create({
      data: {
        name: 'Candidata Revisada',
        party: 'PX',
        state: 'SP',
        position: Position.PRESIDENTE,
        partyHistory: [],
      },
    })
    const reviewed = await prisma.proposal.create({
      data: {
        externalId: 'site-reviewed-economia-0',
        source: 'candidate_site',
        title: 'Texto aprovado',
        description: 'Conteúdo que um revisor aprovou',
        tags: ['economia'],
        status: ProposalStatus.APPROVED,
        isPublished: true,
        origin: ProposalOrigin.AI_EXTRACTION,
        reviewedAt: new Date('2026-08-02T00:00:00Z'),
        candidateId: candidate.id,
      },
    })

    await persistExtractedProposals([{
      externalId: reviewed.externalId!,
      source: 'candidate_site',
      title: 'Texto reextraído',
      description: 'Conteúdo bruto novo que ainda não foi revisado',
      category: 'Economia',
      tags: ['economia'],
      status: ProposalStatus.DRAFT,
      sourceUrl: 'https://candidate.example/propostas',
      candidateId: candidate.id,
    }], prisma)

    await expect(prisma.proposal.findUniqueOrThrow({ where: { id: reviewed.id } }))
      .resolves.toEqual(expect.objectContaining({
        title: 'Texto aprovado',
        description: 'Conteúdo que um revisor aprovou',
        status: ProposalStatus.APPROVED,
        isPublished: true,
        reviewedAt: new Date('2026-08-02T00:00:00Z'),
      }))
  })
})
