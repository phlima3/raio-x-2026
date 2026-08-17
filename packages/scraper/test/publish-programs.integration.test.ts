import {
  Position,
  PrismaClient,
  ProposalOrigin,
  ProposalStatus,
} from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { publishProgramProposals } from '../src/jobs/publishProgramProposals'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

async function clearData() {
  await prisma.proposal.deleteMany()
  await prisma.candidate.deleteMany()
}

async function seedCandidateWithDraft(
  id: string,
  position: Position,
  externalId: string,
  overrides: Record<string, unknown> = {},
) {
  await prisma.candidate.create({
    data: {
      id,
      slug: `${id}-abc-br`,
      name: id,
      party: 'ABC',
      state: 'BR',
      position,
      partyHistory: [],
      isPublished: true,
    },
  })
  await prisma.proposal.create({
    data: {
      externalId,
      source: 'tse_program',
      title: 'Proposta extraída do plano oficial',
      status: ProposalStatus.DRAFT,
      isPublished: false,
      origin: ProposalOrigin.AI_EXTRACTION,
      url: 'https://cdn.tse.jus.br/proposta_governo_2026_BR.zip',
      candidateId: id,
      ...overrides,
    },
  })
}

describe('publishProgramProposals', () => {
  beforeEach(clearData)
  afterAll(async () => {
    await clearData()
    await prisma.$disconnect()
  })

  it('publica só o cargo do escopo e mantém a procedência de IA', async () => {
    await seedCandidateWithDraft('presidente', Position.PRESIDENTE, 'programa-presidente')
    await seedCandidateWithDraft('governador', Position.GOVERNADOR, 'programa-governador')

    const result = await publishProgramProposals({ prisma })

    expect(result).toMatchObject({ candidates: 1, published: 1 })
    const publicado = await prisma.proposal.findUniqueOrThrow({
      where: { externalId: 'programa-presidente' },
    })
    expect(publicado.isPublished).toBe(true)
    expect(publicado.status).toBe(ProposalStatus.SUBMITTED)
    // O front depende disto para marcar "Resumo por IA".
    expect(publicado.origin).toBe(ProposalOrigin.AI_EXTRACTION)
    // Ninguém conferiu; marcar revisão faria a reextração pular a linha.
    expect(publicado.reviewedAt).toBeNull()

    const foraDoEscopo = await prisma.proposal.findUniqueOrThrow({
      where: { externalId: 'programa-governador' },
    })
    expect(foraDoEscopo.isPublished).toBe(false)
  })

  it('não toca em proposta de outra fonte nem em item já revisado', async () => {
    await seedCandidateWithDraft('presidente', Position.PRESIDENTE, 'de-noticia', {
      source: 'news',
    })
    await prisma.proposal.create({
      data: {
        externalId: 'ja-revisada',
        source: 'tse_program',
        title: 'Conferida por revisor',
        status: ProposalStatus.DRAFT,
        isPublished: false,
        origin: ProposalOrigin.AI_EXTRACTION,
        reviewedAt: new Date('2026-08-16T12:00:00.000Z'),
        url: 'https://cdn.tse.jus.br/proposta_governo_2026_BR.zip',
        candidateId: 'presidente',
      },
    })

    const result = await publishProgramProposals({ prisma })

    expect(result.published).toBe(0)
    expect((await prisma.proposal.findUniqueOrThrow({ where: { externalId: 'de-noticia' } })).isPublished)
      .toBe(false)
    expect((await prisma.proposal.findUniqueOrThrow({ where: { externalId: 'ja-revisada' } })).isPublished)
      .toBe(false)
  })

  it('não grava em dry-run', async () => {
    await seedCandidateWithDraft('presidente', Position.PRESIDENTE, 'programa-presidente')

    const result = await publishProgramProposals({ prisma, dryRun: true })

    expect(result.published).toBe(1)
    expect((await prisma.proposal.findUniqueOrThrow({ where: { externalId: 'programa-presidente' } })).isPublished)
      .toBe(false)
  })
})
