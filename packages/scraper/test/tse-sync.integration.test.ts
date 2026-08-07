import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DataSource, PrismaClient, SyncRunStatus } from '@prisma/client'
import { strToU8, zipSync } from 'fflate'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { runTseCandidateSync } from '../src/sources/tse'
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
const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./fixtures/tse/${name}`, import.meta.url)))

describe('runTseCandidateSync', () => {
  beforeEach(async () => {
    await prisma.reviewItem.deleteMany()
    await prisma.candidate.deleteMany()
    await prisma.mandate.deleteMany()
    await prisma.person.deleteMany()
    await prisma.dataSyncRun.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('discovers, parses and idempotently imports one official snapshot', async () => {
    const resource: TseResource = {
      id: 'candidate-resource',
      name: 'Candidatos',
      format: 'CSV',
      url: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      kind: TseResourceKind.CANDIDATES,
    }
    const bytes = Buffer.from(zipSync({
      'consulta_cand_2026_BR.csv': strToU8(''),
      'consulta_cand_2026_BRASIL.csv': fixture('consulta-cand-2026-utf8.csv'),
    }))
    const complementResource: TseResource = {
      id: 'candidate-complement-resource',
      name: 'Consulta complementar de candidatos',
      format: 'CSV',
      url: 'https://cdn.tse.jus.br/consulta_cand_complementar_2026.zip',
      kind: TseResourceKind.CANDIDATE_COMPLEMENT,
    }
    const complementBytes = Buffer.from(zipSync({
      'consulta_cand_complementar_2026_BRASIL.csv': strToU8([
        'ANO_ELEICAO;SQ_CANDIDATO;DS_SITUACAO_JULGAMENTO',
        '2026;260000000001;DEFERIDO',
      ].join('\n')),
    }))
    const client: TseCkanClient = {
      discover: async () => [resource, complementResource],
      download: async (requestedResource) => ({
        resource: requestedResource,
        bytes: requestedResource.kind === TseResourceKind.CANDIDATES ? bytes : complementBytes,
        sha256: createHash('sha256')
          .update(requestedResource.kind === TseResourceKind.CANDIDATES ? bytes : complementBytes)
          .digest('hex'),
        fetchedAt: new Date('2026-08-02T00:00:00Z'),
      }),
    }

    const first = await runTseCandidateSync({ prisma, client, year: 2026 })
    const second = await runTseCandidateSync({ prisma, client, year: 2026 })

    expect(first).toEqual(expect.objectContaining({
      status: SyncRunStatus.SUCCESS,
      metrics: expect.objectContaining({ parsed: 1, created: 1, rejected: 0 }),
    }))
    expect(second.metrics).toEqual(expect.objectContaining({ parsed: 1, created: 0 }))
    await expect(prisma.candidate.count()).resolves.toBe(1)
    await expect(prisma.dataSyncRun.count({
      where: { source: DataSource.TSE, status: SyncRunStatus.SUCCESS },
    })).resolves.toBe(2)
  })

  it('fails closed when the judgment complement is unavailable', async () => {
    const resource: TseResource = {
      id: 'candidate-resource-only',
      name: 'Candidatos',
      format: 'CSV',
      url: 'https://cdn.tse.jus.br/consulta_cand_2026.zip',
      kind: TseResourceKind.CANDIDATES,
    }
    const client: TseCkanClient = {
      discover: async () => [resource],
      download: async () => {
        throw new Error('download must not run without the required complement')
      },
    }

    await expect(runTseCandidateSync({ prisma, client, year: 2026 }))
      .rejects.toThrow('complemento obrigatório')
    await expect(prisma.candidate.count()).resolves.toBe(0)
  })
})
