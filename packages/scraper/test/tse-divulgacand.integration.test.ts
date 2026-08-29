import {
  DataSource,
  DocumentExtractionStatus,
  Position,
  PrismaClient,
  SourceDocumentType,
  SyncRunStatus,
} from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DIVULGACAND_DATASET_KIND,
  runDivulgaCandSync,
} from '../src/sources/tseDivulgaCand'
import {
  parseDivulgaCandUrl,
  DivulgaCandError,
  type DivulgaCandClient,
  type DivulgaCandCandidate,
  type DivulgaCandTarget,
} from '../src/sources/tse/divulgaCand'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

const CANDIDATE_URL =
  'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/280002540694/2026/BR'
const TSE_ID = '280002540694'
const PROGRAM_PDF = Buffer.from('%PDF-1.4 programa de governo')

function detailFor(target: DivulgaCandTarget, overrides: Partial<DivulgaCandCandidate> = {}) {
  const programUrl =
    `https://divulgacandcontas.tse.jus.br/candidaturas/oficial/2026/BR/BR/${target.electionId}` +
    `/${target.candidateId}/proposta_governo1750000000000.pdf`
  return {
    target,
    apiUrl: `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/${target.electionId}/candidato/${target.candidateId}`,
    publicUrl: CANDIDATE_URL,
    tseId: target.candidateId,
    ballotName: 'Fulano Presidente',
    fullName: 'Fulano de Tal',
    party: 'XYZ',
    positionLabel: 'Presidente',
    statusLabel: 'Deferido',
    sites: ['https://fulano.com.br'],
    emails: ['contato@fulano.com.br'],
    files: [
      {
        id: '1',
        name: 'proposta_governo1750000000000.pdf',
        typeCode: '5',
        typeLabel: 'Proposta de governo',
        kind: 'CAMPAIGN_PROGRAM' as const,
        url: programUrl,
      },
      {
        id: '2',
        name: 'certidao_criminal.pdf',
        typeCode: '9',
        typeLabel: 'Certidão criminal',
        kind: 'ATTACHMENT' as const,
        url: programUrl.replace('proposta_governo1750000000000', 'certidao_criminal'),
      },
    ],
    ...overrides,
  } satisfies DivulgaCandCandidate
}

function clientFor(
  overrides: Partial<DivulgaCandCandidate> = {},
  bytes: Buffer = PROGRAM_PDF,
): DivulgaCandClient {
  return {
    fetchCandidate: vi.fn(async (target: DivulgaCandTarget) => detailFor(target, overrides)),
    downloadFile: vi.fn().mockResolvedValue(bytes),
  }
}

async function clearData() {
  await prisma.proposal.deleteMany()
  await prisma.officialDatasetRecord.deleteMany()
  await prisma.sourceDocument.deleteMany()
  await prisma.reviewItem.deleteMany()
  await prisma.candidate.deleteMany()
  await prisma.mandate.deleteMany()
  await prisma.person.deleteMany()
  await prisma.dataSyncRun.deleteMany()
}

async function seedPresidentialCandidate(siteUrl: string | null = null) {
  return prisma.candidate.create({
    data: {
      tseId: TSE_ID,
      slug: 'fulano-de-tal-xyz-br',
      name: 'Fulano de Tal',
      party: 'XYZ',
      state: 'BR',
      position: Position.PRESIDENTE,
      electionYear: 2026,
      isPublished: true,
      isOfficial: true,
      dataSource: DataSource.TSE,
      siteUrl,
    },
    select: { id: true },
  })
}

describe('runDivulgaCandSync', () => {
  beforeEach(clearData)

  afterAll(async () => {
    await clearData()
    await prisma.$disconnect()
  })

  it('attaches the campaign program, the declared links and the candidacy snapshot', async () => {
    const candidate = await seedPresidentialCandidate()
    const client = clientFor()

    const result = await runDivulgaCandSync({
      prisma,
      client,
      urls: [CANDIDATE_URL],
      extractText: vi.fn().mockResolvedValue('Programa de governo: eixo 1'),
    })

    expect(result.status).toBe(SyncRunStatus.SUCCESS)
    expect(result.metrics).toMatchObject({
      consulted: 1,
      documents: 1,
      created: 1,
      extracted: 1,
      sitesLinked: 1,
      // A certidão criminal não é programa de governo e não vira documento.
      ignored: 1,
      failed: 0,
    })
    expect(client.fetchCandidate).toHaveBeenCalledWith(parseDivulgaCandUrl(CANDIDATE_URL))

    const program = await prisma.sourceDocument.findFirst({
      where: { type: SourceDocumentType.CAMPAIGN_PROGRAM },
    })
    expect(program?.candidateId).toBe(candidate.id)
    expect(program?.extractionStatus).toBe(DocumentExtractionStatus.EXTRACTED)
    expect(program?.text).toBe('Programa de governo: eixo 1')
    expect(program?.sourceUrl).toContain('proposta_governo1750000000000.pdf')

    const record = await prisma.officialDatasetRecord.findFirst({
      where: { datasetKind: DIVULGACAND_DATASET_KIND },
    })
    expect(record?.candidateId).toBe(candidate.id)
    expect(record?.externalId).toBe(`20322002026:${TSE_ID}`)
    expect(record?.payload).toMatchObject({
      sites: ['https://fulano.com.br'],
      emails: ['contato@fulano.com.br'],
      publicUrl: CANDIDATE_URL,
    })

    const snapshot = await prisma.sourceDocument.findUnique({
      where: { id: record!.sourceDocumentId },
    })
    expect(snapshot?.type).toBe(SourceDocumentType.TSE_RESOURCE)
    expect(snapshot?.contentType).toBe('application/json')

    expect((await prisma.candidate.findUniqueOrThrow({ where: { id: candidate.id } })).siteUrl)
      .toBe('https://fulano.com.br')
  })

  it('is idempotent and never overwrites a site already reconciled from the open data', async () => {
    await seedPresidentialCandidate('https://site-curado.com.br')
    const extractText = vi.fn().mockResolvedValue('Programa de governo: eixo 1')

    await runDivulgaCandSync({ prisma, client: clientFor(), urls: [CANDIDATE_URL], extractText })
    const second = await runDivulgaCandSync({
      prisma,
      client: clientFor(),
      urls: [CANDIDATE_URL],
      extractText,
    })

    expect(second.metrics).toMatchObject({ created: 0, deduplicated: 1, sitesLinked: 0 })
    // O PDF idêntico é reconhecido pelo SHA-256 e não é reextraído.
    expect(extractText).toHaveBeenCalledTimes(1)
    expect(await prisma.sourceDocument.count({
      where: { type: SourceDocumentType.CAMPAIGN_PROGRAM },
    })).toBe(1)
    expect(await prisma.officialDatasetRecord.count()).toBe(1)
    expect((await prisma.candidate.findFirstOrThrow()).siteUrl).toBe('https://site-curado.com.br')
  })

  it('relinks a program already imported by the catalog ZIP instead of duplicating it', async () => {
    const candidate = await seedPresidentialCandidate()
    await prisma.sourceDocument.create({
      data: {
        source: DataSource.TSE,
        type: SourceDocumentType.CAMPAIGN_PROGRAM,
        sourceUrl: 'https://cdn.tse.jus.br/programas_2026.zip#entry=programa.pdf',
        sha256: (await import('node:crypto')).createHash('sha256').update(PROGRAM_PDF).digest('hex'),
        contentType: 'application/pdf',
        text: 'Programa de governo: eixo 1',
        extractionStatus: DocumentExtractionStatus.EXTRACTED,
      },
    })

    const result = await runDivulgaCandSync({
      prisma,
      client: clientFor(),
      urls: [CANDIDATE_URL],
      extractText: vi.fn(),
    })

    expect(result.metrics).toMatchObject({ created: 0, deduplicated: 1 })
    const documents = await prisma.sourceDocument.findMany({
      where: { type: SourceDocumentType.CAMPAIGN_PROGRAM },
    })
    expect(documents).toHaveLength(1)
    expect(documents[0].candidateId).toBe(candidate.id)
  })

  it('sweeps the published presidential slate when no URL is given', async () => {
    await seedPresidentialCandidate()
    await prisma.candidate.create({
      data: {
        tseId: '280009999999',
        name: 'Sicrana Deputada',
        party: 'ABC',
        state: 'SP',
        position: Position.DEPUTADO_FEDERAL,
        electionYear: 2026,
        isPublished: true,
      },
    })
    const client = clientFor()

    const result = await runDivulgaCandSync({
      prisma,
      client,
      positions: [Position.PRESIDENTE, Position.VICE_PRESIDENTE],
      extractText: vi.fn().mockResolvedValue('Programa'),
    })

    expect(result.metrics).toMatchObject({ candidates: 1, consulted: 1 })
    expect(client.fetchCandidate).toHaveBeenCalledWith({
      year: 2026,
      uf: 'BR',
      electoralUnit: 'BR',
      electionId: '20322002026',
      candidateId: TSE_ID,
    })
  })

  it('records a candidacy with no page as missing, without failing the run', async () => {
    await seedPresidentialCandidate()
    const client: DivulgaCandClient = {
      fetchCandidate: vi.fn().mockRejectedValue(
        new DivulgaCandError('NOT_FOUND', 'DivulgaCandContas respondeu 404'),
      ),
      downloadFile: vi.fn(),
    }

    const result = await runDivulgaCandSync({
      prisma,
      client,
      urls: [CANDIDATE_URL],
      extractText: vi.fn(),
    })

    expect(result.status).toBe(SyncRunStatus.NOOP)
    expect(result.metrics).toMatchObject({ missing: 1, consulted: 0, failed: 0 })
    expect(await prisma.sourceDocument.count()).toBe(0)
  })

  it('fails the run when the consultation itself breaks, instead of reporting partial success', async () => {
    await seedPresidentialCandidate()
    const client: DivulgaCandClient = {
      fetchCandidate: vi.fn().mockRejectedValue(
        new DivulgaCandError('HTTP_ERROR', 'DivulgaCandContas respondeu HTTP 503'),
      ),
      downloadFile: vi.fn(),
    }

    await expect(runDivulgaCandSync({
      prisma,
      client,
      urls: [CANDIDATE_URL],
      extractText: vi.fn(),
    })).rejects.toThrow(/1 consulta/)

    const run = await prisma.dataSyncRun.findFirstOrThrow({
      where: { kind: 'divulgacand-attachments' },
    })
    expect(run.status).toBe(SyncRunStatus.FAILED)
  })

  it('does not create a candidacy for a URL that no imported candidate matches', async () => {
    const result = await runDivulgaCandSync({
      prisma,
      client: clientFor(),
      urls: [CANDIDATE_URL],
      extractText: vi.fn(),
    })

    expect(result.metrics).toMatchObject({ unmatched: 1, consulted: 0 })
    expect(await prisma.candidate.count()).toBe(0)
  })

  it('leaves nothing behind on a dry run', async () => {
    await seedPresidentialCandidate()

    const result = await runDivulgaCandSync({
      prisma,
      client: clientFor(),
      urls: [CANDIDATE_URL],
      dryRun: true,
      extractText: vi.fn().mockResolvedValue('Programa'),
    })

    expect(result.metrics).toMatchObject({ consulted: 1, created: 1, sitesLinked: 1 })
    expect(await prisma.sourceDocument.count()).toBe(0)
    expect(await prisma.officialDatasetRecord.count()).toBe(0)
    expect((await prisma.candidate.findFirstOrThrow()).siteUrl).toBeNull()
  })
})
