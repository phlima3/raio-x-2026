import { DataSource, Position, PrismaClient } from '@prisma/client'
import { zipSync } from 'fflate'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { runTseSupplementalSync } from '../src/sources/tseSupplemental'
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

function csv(headers: string[], rows: string[][]): Buffer {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`
  const text = [headers, ...rows].map((row) => row.map(quote).join(';')).join('\r\n')
  return Buffer.from(text, 'utf8')
}

function archive(filename: string, content: Buffer): Buffer {
  return Buffer.from(zipSync({ [filename]: content }))
}

const definitions: Array<{ resource: TseResource; bytes: Buffer }> = [
  {
    resource: { id: 'complement', name: 'Complementar', format: 'CSV', url: 'https://tse/complement.zip', kind: TseResourceKind.CANDIDATE_COMPLEMENT },
    bytes: archive('consulta_cand_complementar_2026_BRASIL.csv', csv(
      ['ANO_ELEICAO', 'SQ_CANDIDATO', 'DS_SITUACAO_CANDIDATO_TOT', 'NR_CPF_CANDIDATO'],
      [['2026', '123', 'APTO', '00000000000']],
    )),
  },
  {
    resource: { id: 'assets', name: 'Bens', format: 'CSV', url: 'https://tse/assets.zip', kind: TseResourceKind.ASSETS },
    bytes: archive('bem_candidato_2026_BRASIL.csv', csv(
      ['ANO_ELEICAO', 'SQ_CANDIDATO', 'NR_ORDEM_BEM_CANDIDATO', 'DS_TIPO_BEM_CANDIDATO', 'DS_BEM_CANDIDATO', 'VR_BEM_CANDIDATO'],
      [
        ['2026', '123', '1', 'Imóvel', 'Casa', '100000,50'],
        ['2026', '123', '2', 'Veículo', 'Carro', '50000,25'],
      ],
    )),
  },
  {
    resource: { id: 'coalitions', name: 'Coligações', format: 'CSV', url: 'https://tse/coalitions.zip', kind: TseResourceKind.COALITIONS },
    bytes: archive('consulta_coligacao_2026_BRASIL.csv', csv(
      ['ANO_ELEICAO', 'SG_UF', 'DS_CARGO', 'SG_PARTIDO', 'NM_COLIGACAO'],
      [['2026', 'SP', 'GOVERNADOR', 'PX', 'Coligação Teste']],
    )),
  },
  {
    resource: { id: 'vacancies', name: 'Vagas', format: 'CSV', url: 'https://tse/vacancies.zip', kind: TseResourceKind.VACANCIES },
    bytes: archive('consulta_vagas_2026_BRASIL.csv', csv(
      ['ANO_ELEICAO', 'SG_UF', 'DS_CARGO', 'QT_VAGA'],
      [['2026', 'SP', 'GOVERNADOR', '1']],
    )),
  },
  {
    resource: { id: 'cassations', name: 'Cassações', format: 'CSV', url: 'https://tse/cassations.zip', kind: TseResourceKind.CASSATIONS },
    bytes: archive('motivo_cassacao_2026_BRASIL.csv', csv(
      ['ANO_ELEICAO', 'SQ_CANDIDATO', 'NR_PROCESSO', 'DS_MOTIVO'],
      [],
    )),
  },
  {
    resource: { id: 'social', name: 'Redes sociais', format: 'CSV', url: 'https://tse/social.zip', kind: TseResourceKind.SOCIAL_MEDIA },
    bytes: archive('rede_social_candidato_2026_BRASIL.csv', csv(
      ['AA_ELEICAO', 'SQ_CANDIDATO', 'NR_ORDEM_REDE_SOCIAL', 'DS_URL'],
      [['2026', '123', '1', 'https://social.example/oficial']],
    )),
  },
]

function makeClient(): TseCkanClient {
  return {
    discover: vi.fn().mockResolvedValue(definitions.map(({ resource }) => resource)),
    download: vi.fn(async (resource: TseResource) => {
      const definition = definitions.find((candidate) => candidate.resource.id === resource.id)
      if (!definition) throw new Error(`Unknown resource ${resource.id}`)
      return {
        resource,
        bytes: definition.bytes,
        sha256: `sha-${resource.id}`,
        fetchedAt: new Date('2026-08-01T07:00:00.000Z'),
      }
    }),
  }
}

async function clearData() {
  await prisma.proposal.deleteMany()
  await prisma.assetDeclaration.deleteMany()
  await prisma.reviewItem.deleteMany()
  await prisma.officialDatasetRecord.deleteMany()
  await prisma.sourceDocument.deleteMany()
  await prisma.candidate.deleteMany()
  await prisma.mandate.deleteMany()
  await prisma.person.deleteMany()
  await prisma.dataSyncRun.deleteMany()
}

describe('runTseSupplementalSync', () => {
  beforeEach(clearData)
  afterAll(async () => {
    await clearData()
    await prisma.$disconnect()
  })

  it('imports every available resource idempotently and never persists CPF', async () => {
    await prisma.candidate.create({
      data: {
        id: 'candidate-123',
        tseId: '123',
        slug: 'candidata-px-sp-governador-2026',
        name: 'Candidata Oficial',
        party: 'PX',
        state: 'SP',
        position: Position.GOVERNADOR,
        partyHistory: [],
        electionYear: 2026,
        isOfficial: true,
        isPublished: true,
        dataSource: DataSource.TSE,
      },
    })
    const client = makeClient()

    const first = await runTseSupplementalSync({ prisma, client })
    const second = await runTseSupplementalSync({ prisma, client })

    expect(first.metrics.records).toBe(6)
    expect(second.metrics.records).toBe(6)
    expect(await prisma.sourceDocument.count()).toBe(6)
    expect(await prisma.officialDatasetRecord.count()).toBe(6)
    const serialized = JSON.stringify(await prisma.officialDatasetRecord.findMany())
    expect(serialized).not.toContain('00000000000')
    expect(serialized).not.toContain('NR_CPF_CANDIDATO')

    const candidate = await prisma.candidate.findUniqueOrThrow({ where: { id: 'candidate-123' } })
    expect(candidate.officialStatusRaw).toBe('APTO')
    expect(candidate.coalitionName).toBe('Coligação Teste')
    expect(candidate.siteUrl).toBe('https://social.example/oficial')

    const assets = await prisma.assetDeclaration.findUniqueOrThrow({
      where: { candidateId_year: { candidateId: candidate.id, year: 2026 } },
    })
    expect(assets.totalValue.toString()).toBe('150000.75')
    expect((assets.assets as unknown[])).toHaveLength(2)
  })

  it('repairs archive links when canonical candidacy arrives after supplemental data', async () => {
    const client = makeClient()
    await runTseSupplementalSync({ prisma, client })
    expect(await prisma.officialDatasetRecord.count({
      where: { candidateId: { not: null } },
    })).toBe(0)

    const candidate = await prisma.candidate.create({
      data: {
        id: 'candidate-123',
        tseId: '123',
        slug: 'candidata-px-sp-governador-2026',
        name: 'Candidata Oficial',
        party: 'PX',
        state: 'SP',
        position: Position.GOVERNADOR,
        partyHistory: [],
        electionYear: 2026,
        isOfficial: true,
        isPublished: true,
        dataSource: DataSource.TSE,
      },
    })
    const second = await runTseSupplementalSync({ prisma, client })

    expect(await prisma.officialDatasetRecord.count()).toBe(6)
    expect(await prisma.officialDatasetRecord.count({
      where: { candidateId: candidate.id },
    })).toBe(4)
    expect(await prisma.officialDatasetRecord.count({
      where: { syncRunId: second.runId },
    })).toBe(6)
  })
})
