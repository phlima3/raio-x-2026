import { PrismaClient, Position } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { backfillLegacyPeople } from '../src/jobs/backfillPersons'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('_test')) {
  throw new Error('Integration tests require a DATABASE_URL whose database name contains _test')
}

const prisma = new PrismaClient()

describe('backfillLegacyPeople', () => {
  beforeEach(async () => {
    await prisma.reviewItem.deleteMany()
    await prisma.candidate.deleteMany()
    await prisma.mandate.deleteMany()
    await prisma.person.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('links a known person duplicate without changing legacy candidate IDs or slugs', async () => {
    const first = await prisma.candidate.create({
      data: {
        id: 'legacy-romeu-president',
        slug: 'romeu-zema-novo-mg',
        name: 'Romeu Zema',
        party: 'Novo',
        state: 'MG',
        position: Position.PRESIDENTE,
        partyHistory: [],
      },
    })
    const second = await prisma.candidate.create({
      data: {
        id: 'legacy-romeu-governor',
        slug: 'romeu-zema-novo-mg-governador-2026',
        name: 'Romeu Zema',
        party: 'Novo',
        state: 'MG',
        position: Position.GOVERNADOR,
        partyHistory: [],
      },
    })

    const firstRun = await backfillLegacyPeople(prisma)
    const secondRun = await backfillLegacyPeople(prisma)
    const candidates = await prisma.candidate.findMany({
      where: { id: { in: [first.id, second.id] } },
      orderBy: { id: 'asc' },
    })

    expect(new Set(candidates.map((candidate) => candidate.personId)).size).toBe(1)
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual([
      'legacy-romeu-governor',
      'legacy-romeu-president',
    ])
    expect(candidates.map((candidate) => candidate.slug).sort()).toEqual([
      'romeu-zema-novo-mg',
      'romeu-zema-novo-mg-governador-2026',
    ])
    expect(firstRun).toEqual(expect.objectContaining({ peopleCreated: 1, candidatesLinked: 2 }))
    expect(secondRun).toEqual(expect.objectContaining({ peopleCreated: 0, candidatesLinked: 0 }))
    await expect(prisma.person.count()).resolves.toBe(1)
  })

  it('never auto-merges an ambiguous duplicate name', async () => {
    await prisma.candidate.createMany({
      data: [
        {
          id: 'legacy-joao-sp',
          slug: 'joao-da-silva-abc-sp-presidente-2026',
          name: 'João da Silva',
          party: 'ABC',
          state: 'SP',
          position: Position.PRESIDENTE,
          partyHistory: [],
        },
        {
          id: 'legacy-joao-rj',
          slug: 'joao-da-silva-xyz-rj-governador-2026',
          name: 'João da Silva',
          party: 'XYZ',
          state: 'RJ',
          position: Position.GOVERNADOR,
          partyHistory: [],
        },
      ],
    })

    const metrics = await backfillLegacyPeople(prisma)
    const candidates = await prisma.candidate.findMany({
      where: { id: { startsWith: 'legacy-joao-' } },
    })

    expect(new Set(candidates.map((candidate) => candidate.personId)).size).toBe(2)
    expect(metrics.reviewItemsCreated).toBe(2)
    await expect(prisma.reviewItem.count()).resolves.toBe(2)

    await backfillLegacyPeople(prisma)
    await expect(prisma.person.count()).resolves.toBe(2)
    await expect(prisma.reviewItem.count()).resolves.toBe(2)
  })
})
