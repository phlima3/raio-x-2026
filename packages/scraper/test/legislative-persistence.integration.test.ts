import { DataSource, MandateHouse, PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { upsertLegislatorMandate } from '../src/legislative/persistence'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

describe('legislative persistence', () => {
  beforeEach(async () => {
    await prisma.reviewItem.deleteMany()
    await prisma.candidate.deleteMany()
    await prisma.mandate.deleteMany()
    await prisma.person.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it.each([
    [DataSource.CAMARA, MandateHouse.CAMARA, '123', '57'],
    [DataSource.SENADO, MandateHouse.SENADO, '456', '57'],
  ])('upserts %s as Person/Mandate and never creates a candidacy', async (
    source,
    house,
    externalId,
    legislatureId,
  ) => {
    const input = {
      source,
      house,
      externalId,
      legislatureId,
      name: `Parlamentar ${source}`,
      socialName: null,
      party: 'ABC',
      state: 'SP',
      role: house === MandateHouse.CAMARA ? 'DEPUTADO_FEDERAL' : 'SENADOR',
      sourceUrl: `https://example.invalid/${externalId}`,
      syncedAt: new Date('2026-08-02T00:00:00Z'),
    }

    const first = await upsertLegislatorMandate(prisma, input)
    const second = await upsertLegislatorMandate(prisma, input)

    expect(second).toEqual(first)
    await expect(prisma.person.count()).resolves.toBe(1)
    await expect(prisma.mandate.count()).resolves.toBe(1)
    await expect(prisma.candidate.count()).resolves.toBe(0)
  })
})
