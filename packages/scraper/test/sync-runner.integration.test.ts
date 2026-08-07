import { DataSource, PrismaClient, SyncRunStatus } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  createPrismaSyncRunStore,
  runDataSourceSync,
} from '../src/sync/runDataSourceSync'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

describe('runDataSourceSync with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.dataSyncRun.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('persists the source failure before propagating it to the CLI', async () => {
    const failure = new Error('resource checksum mismatch')

    await expect(runDataSourceSync({
      source: DataSource.TSE,
      kind: 'candidates',
      sourceUrl: 'https://dadosabertos.tse.jus.br/fixture.zip',
      store: createPrismaSyncRunStore(prisma),
      execute: async () => { throw failure },
    })).rejects.toBe(failure)

    const run = await prisma.dataSyncRun.findFirstOrThrow()
    expect(run).toEqual(expect.objectContaining({
      source: DataSource.TSE,
      kind: 'candidates',
      status: SyncRunStatus.FAILED,
      error: 'resource checksum mismatch',
    }))
    expect(run.finishedAt).toBeInstanceOf(Date)
  })

  it('marks an abandoned run failed when the same source starts again', async () => {
    const abandoned = await prisma.dataSyncRun.create({
      data: {
        source: DataSource.TSE,
        kind: 'supplemental',
        startedAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    })
    const recent = await prisma.dataSyncRun.create({
      data: {
        source: DataSource.TSE,
        kind: 'supplemental',
        startedAt: new Date(),
      },
    })

    await runDataSourceSync({
      source: DataSource.TSE,
      kind: 'supplemental',
      store: createPrismaSyncRunStore(prisma),
      execute: async () => ({ metrics: { records: 0 } }),
    })

    expect(await prisma.dataSyncRun.findUniqueOrThrow({ where: { id: abandoned.id } }))
      .toEqual(expect.objectContaining({
        status: SyncRunStatus.FAILED,
        error: 'Abandoned after exceeding the 6-hour sync-run lease',
        finishedAt: expect.any(Date),
      }))
    expect(await prisma.dataSyncRun.findUniqueOrThrow({ where: { id: recent.id } }))
      .toEqual(expect.objectContaining({
        status: SyncRunStatus.RUNNING,
        error: null,
        finishedAt: null,
      }))
  })
})
