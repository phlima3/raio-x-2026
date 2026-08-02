import {
  DataSource,
  MandateHouse,
  OfficialCandidacyStatus,
  Position,
  PrismaClient,
} from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { importTseCandidates } from '../src/sources/tse/importCandidates'
import type { TseCandidateRecord } from '../src/sources/tse/candidateCsv'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

function officialCandidate(overrides: Partial<TseCandidateRecord> = {}): TseCandidateRecord {
  return {
    tseId: '260000000100',
    electionYear: 2026,
    electionId: '999',
    state: 'SP',
    position: 'PRESIDENTE',
    rawPosition: 'PRESIDENTE',
    name: 'MARIA DA SILVA',
    ballotName: 'MARIA',
    party: 'ABC',
    ballotNumber: 10,
    rawStatus: 'APTO',
    normalizedStatus: 'ELIGIBLE',
    raw: {},
    ...overrides,
  }
}

describe('importTseCandidates', () => {
  beforeEach(async () => {
    await prisma.reviewItem.deleteMany()
    await prisma.candidate.deleteMany()
    await prisma.mandate.deleteMany()
    await prisma.person.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('reconciles an unequivocal editorial candidate and preserves its ID and slug', async () => {
    await prisma.candidate.create({
      data: {
        id: 'editorial-maria',
        slug: 'maria-da-silva-abc-sp',
        name: 'Maria da Silva',
        party: 'ABC',
        state: 'SP',
        position: Position.PRESIDENTE,
        partyHistory: [],
        dataSource: DataSource.EDITORIAL,
        isPublished: true,
      },
    })

    const first = await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })
    const second = await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })
    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000100' },
    })

    expect(candidate).toEqual(expect.objectContaining({
      id: 'editorial-maria',
      slug: 'maria-da-silva-abc-sp',
      isOfficial: true,
      officialStatus: OfficialCandidacyStatus.ELIGIBLE,
      isPublished: true,
      dataSource: DataSource.TSE,
    }))
    expect(candidate.personId).not.toBeNull()
    expect(first).toEqual(expect.objectContaining({ matched: 1, created: 0 }))
    expect(second.created).toBe(0)
    await expect(prisma.candidate.count()).resolves.toBe(1)
    await expect(prisma.person.count()).resolves.toBe(1)
  })

  it('creates a hidden official candidacy and review item for an ambiguous match', async () => {
    await prisma.candidate.createMany({
      data: [
        {
          id: 'editorial-maria-a',
          slug: 'maria-da-silva-a',
          name: 'Maria da Silva',
          party: 'ABC',
          state: 'SP',
          position: Position.PRESIDENTE,
          partyHistory: [],
        },
        {
          id: 'editorial-maria-b',
          slug: 'maria-da-silva-b',
          name: 'Maria da Silva',
          party: 'ABC',
          state: 'SP',
          position: Position.PRESIDENTE,
          partyHistory: [],
        },
      ],
    })

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })
    await importTseCandidates(prisma, {
      records: [officialCandidate()],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })
    const official = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: '260000000100' },
    })

    expect(official.isPublished).toBe(false)
    expect(metrics).toEqual(expect.objectContaining({
      created: 1,
      matched: 0,
      ambiguous: 1,
      reviewItems: 1,
    }))
    await expect(prisma.candidate.count()).resolves.toBe(3)
    await expect(prisma.reviewItem.count()).resolves.toBe(1)
  })

  it('does not delete or unpublish editorial candidates when a snapshot is empty', async () => {
    await prisma.candidate.create({
      data: {
        id: 'editorial-pre-candidate',
        slug: 'pre-candidate-abc-br',
        name: 'Pré Candidato',
        party: 'ABC',
        state: 'BR',
        position: Position.PRESIDENTE,
        partyHistory: [],
        isPublished: true,
      },
    })

    const metrics = await importTseCandidates(prisma, {
      records: [],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'empty-snapshot',
    })

    expect(metrics.parsed).toBe(0)
    await expect(prisma.candidate.findUniqueOrThrow({
      where: { id: 'editorial-pre-candidate' },
      select: { isPublished: true },
    })).resolves.toEqual({ isPublished: true })
  })

  it('stores every supported TSE office but publishes only enabled offices', async () => {
    const positions = [
      'PRESIDENTE',
      'VICE_PRESIDENTE',
      'GOVERNADOR',
      'VICE_GOVERNADOR',
      'SENADOR',
      '1_SUPLENTE',
      '2_SUPLENTE',
      'DEPUTADO_FEDERAL',
      'DEPUTADO_ESTADUAL',
      'DEPUTADO_DISTRITAL',
      'PREFEITO',
      'VICE_PREFEITO',
      'VEREADOR',
    ]
    const records = positions.map((position, index) => officialCandidate({
      tseId: `2600000002${String(index).padStart(2, '0')}`,
      name: `CANDIDATO ${index}`,
      ballotName: `CAND ${index}`,
      position,
      rawPosition: position,
    }))

    const metrics = await importTseCandidates(prisma, {
      records,
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'all-offices',
      batchSize: 3,
    })

    expect(metrics).toEqual(expect.objectContaining({ created: 13, published: 3, hidden: 10 }))
    await expect(prisma.candidate.count()).resolves.toBe(13)
    await expect(prisma.candidate.count({ where: { isPublished: true } })).resolves.toBe(3)
  })

  it('reuses an unequivocal legislative Person when TSE runs after Senado', async () => {
    const person = await prisma.person.create({
      data: {
        name: 'Senadora Integrada',
        normalizedName: 'SENADORA INTEGRADA',
        senadoId: 'senado-integrated',
        dataSource: DataSource.SENADO,
      },
    })
    await prisma.mandate.create({
      data: {
        personId: person.id,
        source: DataSource.SENADO,
        externalId: 'senado-integrated',
        legislatureId: '57',
        house: MandateHouse.SENADO,
        role: 'SENADOR',
        state: 'SP',
        party: 'PX',
      },
    })

    await importTseCandidates(prisma, {
      records: [officialCandidate({
        tseId: 'tse-integrated',
        name: 'Senadora Integrada',
        ballotName: 'Senadora Integrada',
        party: 'PX',
        state: 'SP',
        position: 'SENADOR',
        rawPosition: 'SENADOR',
      })],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })

    const candidate = await prisma.candidate.findUniqueOrThrow({ where: { tseId: 'tse-integrated' } })
    expect(candidate.personId).toBe(person.id)
    await expect(prisma.person.count()).resolves.toBe(1)
    await expect(prisma.reviewItem.count()).resolves.toBe(0)
  })

  it('keeps ambiguous legislative identities separate when TSE runs after Senado', async () => {
    for (const suffix of ['a', 'b']) {
      const person = await prisma.person.create({
        data: {
          name: 'Senador Homônimo',
          normalizedName: 'SENADOR HOMONIMO',
          senadoId: `senado-${suffix}`,
          dataSource: DataSource.SENADO,
        },
      })
      await prisma.mandate.create({
        data: {
          personId: person.id,
          source: DataSource.SENADO,
          externalId: `senado-${suffix}`,
          legislatureId: '57',
          house: MandateHouse.SENADO,
          role: 'SENADOR',
          state: 'SP',
          party: 'PX',
        },
      })
    }

    const metrics = await importTseCandidates(prisma, {
      records: [officialCandidate({
        tseId: 'tse-ambiguous-legislative',
        name: 'Senador Homônimo',
        ballotName: 'Senador Homônimo',
        party: 'PX',
        state: 'SP',
        position: 'SENADOR',
        rawPosition: 'SENADOR',
      })],
      sourceUrl: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      checksum: 'snapshot-sha',
    })

    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { tseId: 'tse-ambiguous-legislative' },
    })
    expect(candidate.isPublished).toBe(false)
    expect(metrics).toEqual(expect.objectContaining({ ambiguous: 1, reviewItems: 1 }))
    await expect(prisma.person.count()).resolves.toBe(3)
    await expect(prisma.reviewItem.count({ where: { candidateId: candidate.id } })).resolves.toBe(1)
  })
})
