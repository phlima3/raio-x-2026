import {
  DataSource,
  DocumentExtractionStatus,
  Position,
  PrismaClient,
  ProposalOrigin,
  ProposalStatus,
  SourceDocumentType,
} from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { runProgramProposalExtraction } from '../src/jobs/extractProgramProposals'
import type { LLMProvider, ProposalsByTheme } from '../src/processors/llm'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

function providerReturning(byTheme: Partial<ProposalsByTheme>): LLMProvider {
  const full: ProposalsByTheme = {
    economia: [], saude: [], educacao: [], seguranca: [],
    meioambiente: [], tecnologia: [], politicaexterna: [], outros: [],
    ...byTheme,
  }
  return {
    inputBudget: 900_000,
    complete: vi.fn(),
    extractProposals: vi.fn().mockResolvedValue(full),
    summarizeProposal: vi.fn(),
    summarizeBio: vi.fn(),
    compareProposals: vi.fn(),
  }
}

async function clearData() {
  await prisma.proposal.deleteMany()
  await prisma.sourceDocument.deleteMany()
  await prisma.candidate.deleteMany()
  await prisma.dataSyncRun.deleteMany()
}

async function seedProgram() {
  const candidate = await prisma.candidate.create({
    data: {
      id: 'candidato-com-programa',
      slug: 'candidato-com-programa-abc-br-presidente-2026',
      name: 'Candidato Com Programa',
      party: 'ABC',
      state: 'BR',
      position: Position.PRESIDENTE,
      partyHistory: [],
      isPublished: true,
    },
  })
  const document = await prisma.sourceDocument.create({
    data: {
      source: DataSource.TSE,
      type: SourceDocumentType.CAMPAIGN_PROGRAM,
      sourceUrl: 'https://cdn.tse.jus.br/proposta_governo_2026_BR.zip#entry=plano.pdf',
      sha256: 'programa-sha',
      text: 'PLANO DE GOVERNO — texto oficial registrado no TSE.',
      extractionStatus: DocumentExtractionStatus.EXTRACTED,
      candidateId: candidate.id,
    },
  })
  return { candidate, document }
}

describe('runProgramProposalExtraction', () => {
  beforeEach(clearData)
  afterAll(async () => {
    await clearData()
    await prisma.$disconnect()
  })

  it('grava a saída da IA oculta e em rascunho, ligada ao documento oficial', async () => {
    const { candidate, document } = await seedProgram()

    await runProgramProposalExtraction({
      prisma,
      provider: providerReturning({ economia: ['Desindexar benefícios do salário mínimo.'] }),
    })

    const proposal = await prisma.proposal.findFirstOrThrow()
    expect(proposal).toMatchObject({
      candidateId: candidate.id,
      sourceDocumentId: document.id,
      source: 'tse_program',
      category: 'Economia',
      status: ProposalStatus.DRAFT,
      isPublished: false,
      origin: ProposalOrigin.AI_EXTRACTION,
    })
  })

  it('nunca sobrescreve proposta já revisada ao reprocessar o mesmo programa', async () => {
    await seedProgram()
    const provider = providerReturning({ economia: ['Primeira leitura da IA.'] })

    await runProgramProposalExtraction({ prisma, provider })
    const first = await prisma.proposal.findFirstOrThrow()
    await prisma.proposal.update({
      where: { id: first.id },
      data: {
        title: 'Texto conferido por revisor',
        description: 'Redação aprovada na revisão editorial',
        status: ProposalStatus.APPROVED,
        isPublished: true,
        reviewedAt: new Date('2026-08-16T12:00:00.000Z'),
      },
    })

    const result = await runProgramProposalExtraction({
      prisma,
      provider: providerReturning({ economia: ['Segunda leitura, diferente da primeira.'] }),
    })

    const preserved = await prisma.proposal.findUniqueOrThrow({ where: { id: first.id } })
    expect(preserved.description).toBe('Redação aprovada na revisão editorial')
    expect(preserved.isPublished).toBe(true)
    expect(result.metrics.preserved).toBe(1)
    expect(result.metrics.created).toBe(0)
  })

  it('não grava nada em dry-run', async () => {
    await seedProgram()

    const result = await runProgramProposalExtraction({
      prisma,
      provider: providerReturning({ saude: ['Ampliar atenção primária.'] }),
      dryRun: true,
    })

    expect(result.metrics.extracted).toBe(1)
    expect(await prisma.proposal.count()).toBe(0)
  })
})
