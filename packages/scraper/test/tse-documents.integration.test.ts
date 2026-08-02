import {
  DocumentExtractionStatus,
  PrismaClient,
  SyncRunStatus,
} from '@prisma/client'
import { zipSync } from 'fflate'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { runTseDocumentSync } from '../src/sources/tseDocuments'
import {
  TseResourceKind,
  type TseCkanClient,
  type TseResource,
} from '../src/sources/tse/ckanClient'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

const resource: TseResource = {
  id: 'campaign-programs',
  name: 'Programas de governo 2026',
  format: 'ZIP',
  url: 'https://cdn.tse.jus.br/programas_2026.zip',
  kind: TseResourceKind.CAMPAIGN_PROGRAMS,
}

async function clearData() {
  await prisma.proposal.deleteMany()
  await prisma.sourceDocument.deleteMany()
  await prisma.reviewItem.deleteMany()
  await prisma.candidate.deleteMany()
  await prisma.mandate.deleteMany()
  await prisma.person.deleteMany()
  await prisma.dataSyncRun.deleteMany()
}

function clientWith(resources: TseResource[], bytes = Buffer.alloc(0)): TseCkanClient {
  return {
    discover: vi.fn().mockResolvedValue(resources),
    download: vi.fn().mockResolvedValue({
      resource,
      bytes,
      sha256: 'archive-checksum',
      fetchedAt: new Date('2026-08-01T08:00:00.000Z'),
    }),
  }
}

describe('runTseDocumentSync', () => {
  beforeEach(clearData)

  afterAll(async () => {
    await clearData()
    await prisma.$disconnect()
  })

  it('is a successful no-op when the official catalog has no PDFs', async () => {
    const result = await runTseDocumentSync({
      prisma,
      client: clientWith([]),
      extractText: vi.fn(),
    })

    expect(result.status).toBe(SyncRunStatus.NOOP)
    expect(result.metrics.documents).toBe(0)
    expect(await prisma.sourceDocument.count()).toBe(0)
  })

  it('deduplicates a repeated PDF by SHA-256 and marks an empty PDF NEEDS_OCR', async () => {
    const archive = Buffer.from(zipSync({
      'programas/programa_000000000123.pdf': Buffer.from('%PDF-1.4 blank'),
      'programas/README.txt': Buffer.from('ignored'),
    }))
    const client = clientWith([resource], archive)
    const extractText = vi.fn().mockResolvedValue('')

    await runTseDocumentSync({ prisma, client, extractText })
    await runTseDocumentSync({ prisma, client, extractText })

    const documents = await prisma.sourceDocument.findMany()
    expect(documents).toHaveLength(1)
    expect(documents[0].extractionStatus).toBe(DocumentExtractionStatus.NEEDS_OCR)
    expect(documents[0].text).toBeNull()
    expect(extractText).toHaveBeenCalledTimes(1)
  })

  it('stores searchable text for a digital PDF', async () => {
    const client = clientWith(
      [{ ...resource, format: 'PDF', url: 'https://divulgacand.tse.jus.br/programa.pdf' }],
      Buffer.from('%PDF-1.4 digital'),
    )

    await runTseDocumentSync({
      prisma,
      client,
      extractText: vi.fn().mockResolvedValue('Programa oficial de educação'),
    })

    const document = await prisma.sourceDocument.findFirstOrThrow()
    expect(document.extractionStatus).toBe(DocumentExtractionStatus.EXTRACTED)
    expect(document.text).toBe('Programa oficial de educação')
  })
})
