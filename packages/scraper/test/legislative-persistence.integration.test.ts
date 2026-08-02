import { DataSource, MandateHouse, Position, PrismaClient } from '@prisma/client'
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

  it('links an unequivocal TSE person by name, office, party and UF', async () => {
    const person = await prisma.person.create({
      data: { name: 'Senadora Integrada', normalizedName: 'SENADORA INTEGRADA', dataSource: DataSource.TSE },
    })
    await prisma.candidate.create({
      data: {
        tseId: 'tse-integrated',
        name: 'Senadora Integrada',
        party: 'PX',
        state: 'SP',
        position: Position.SENADOR,
        partyHistory: [],
        personId: person.id,
      },
    })

    const ids = await upsertLegislatorMandate(prisma, {
      source: DataSource.SENADO,
      house: MandateHouse.SENADO,
      externalId: 'senado-integrated',
      legislatureId: '57',
      name: 'Senadora Integrada',
      socialName: 'Senadora Integrada',
      party: 'PX',
      state: 'SP',
      role: 'SENADOR',
      sourceUrl: 'https://senado.example/integrated',
      syncedAt: new Date('2026-08-02T00:00:00Z'),
    })

    expect(ids.personId).toBe(person.id)
    expect((await prisma.person.findUniqueOrThrow({ where: { id: person.id } })).senadoId)
      .toBe('senado-integrated')
    expect(await prisma.person.count()).toBe(1)
  })

  it('never auto-links ambiguous identities and creates a ReviewItem', async () => {
    for (const suffix of ['a', 'b']) {
      const person = await prisma.person.create({
        data: { name: 'Nome Homônimo', normalizedName: 'NOME HOMONIMO', dataSource: DataSource.TSE },
      })
      await prisma.candidate.create({
        data: {
          tseId: `tse-${suffix}`,
          slug: `nome-homonimo-${suffix}`,
          name: 'Nome Homônimo',
          party: 'PX',
          state: 'SP',
          position: Position.SENADOR,
          partyHistory: [],
          personId: person.id,
        },
      })
    }

    const ids = await upsertLegislatorMandate(prisma, {
      source: DataSource.SENADO,
      house: MandateHouse.SENADO,
      externalId: 'senado-ambiguous',
      legislatureId: '57',
      name: 'Nome Homônimo',
      socialName: 'Nome Homônimo',
      party: 'PX',
      state: 'SP',
      role: 'SENADOR',
      sourceUrl: 'https://senado.example/ambiguous',
      syncedAt: new Date('2026-08-02T00:00:00Z'),
    })

    expect(await prisma.person.count()).toBe(3)
    expect(await prisma.candidate.count()).toBe(2)
    expect(await prisma.reviewItem.count({ where: { personId: ids.personId } })).toBe(1)
  })
})
