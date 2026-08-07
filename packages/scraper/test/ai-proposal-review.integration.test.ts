import {
  Position,
  PrismaClient,
  ProposalOrigin,
  ProposalStatus,
} from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  persistExtractedProposals,
  reconcileExtractedProposals,
} from '../src/processors/proposalExtractor'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

describe('AI proposal review lifecycle', () => {
  beforeEach(async () => {
    await prisma.consistencyScore.deleteMany()
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

  it('atomically unpublishes reviewed proposals removed from a successful snapshot', async () => {
    const sourceUrl = 'https://candidate.example/programa'
    const originalMaterialDate = new Date('2026-07-01T00:00:00Z')
    const candidate = await prisma.candidate.create({
      data: {
        slug: 'candidata-reconciliada-px-br',
        name: 'Candidata Reconciliada',
        party: 'PX',
        state: 'BR',
        position: Position.PRESIDENTE,
        partyHistory: [],
        materialUpdatedAt: originalMaterialDate,
      },
    })
    const reviewedAt = new Date('2026-08-01T00:00:00Z')
    const proposal = await prisma.proposal.create({
      data: {
        externalId: 'site-removed-saude-0',
        source: 'candidate_site',
        title: 'Proposta removida da fonte',
        tags: ['saude'],
        status: ProposalStatus.APPROVED,
        isPublished: true,
        origin: ProposalOrigin.AI_EXTRACTION,
        reviewedAt,
        url: sourceUrl,
        candidateId: candidate.id,
      },
    })
    await prisma.consistencyScore.create({
      data: {
        candidateId: candidate.id,
        theme: 'Saúde',
        score: 90,
        label: 'Alto',
        explanation: 'Pontuação derivada da proposta que saiu do site.',
      },
    })

    await expect(reconcileExtractedProposals(
      [],
      { candidateId: candidate.id, sourceUrl },
      prisma,
    )).resolves.toEqual({ saved: 0, removed: 1 })

    await expect(prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } }))
      .resolves.toEqual(expect.objectContaining({
        status: ProposalStatus.DRAFT,
        isPublished: false,
        reviewedAt,
      }))
    await expect(prisma.consistencyScore.count({ where: { candidateId: candidate.id } }))
      .resolves.toBe(0)
    const updatedCandidate = await prisma.candidate.findUniqueOrThrow({
      where: { id: candidate.id },
    })
    expect(updatedCandidate.materialUpdatedAt!.getTime()).toBeGreaterThan(
      originalMaterialDate.getTime(),
    )
  })
})
