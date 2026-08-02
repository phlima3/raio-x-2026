import 'dotenv/config'
import {
  DataSource,
  PrismaClient,
  ReviewItemKind,
} from '@prisma/client'

import { logger } from '../utils/logger'

type BackfillDatabase = Pick<PrismaClient, 'candidate' | 'person' | 'reviewItem'>

export interface PersonBackfillMetrics {
  candidatesScanned: number
  candidatesLinked: number
  peopleCreated: number
  alreadyLinked: number
  reviewItemsCreated: number
}

const KNOWN_SHARED_IDENTITIES = new Set([
  'EDUARDO LEITE',
  'ROMEU ZEMA',
  'RONALDO CAIADO',
])

export function normalizePersonName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function ambiguityKey(normalizedName: string, candidateId: string): string {
  return `legacy-person-ambiguity:${normalizedName}:${candidateId}`
}

export async function backfillLegacyPeople(
  db: BackfillDatabase,
): Promise<PersonBackfillMetrics> {
  const candidates = await db.candidate.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      socialName: true,
      camaraId: true,
      senadoId: true,
      personId: true,
      dataSource: true,
    },
  })

  const counts = new Map<string, number>()
  for (const candidate of candidates) {
    const key = normalizePersonName(candidate.name)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const metrics: PersonBackfillMetrics = {
    candidatesScanned: candidates.length,
    candidatesLinked: 0,
    peopleCreated: 0,
    alreadyLinked: 0,
    reviewItemsCreated: 0,
  }

  for (const candidate of candidates) {
    if (candidate.personId) {
      metrics.alreadyLinked++
      continue
    }

    const normalizedName = normalizePersonName(candidate.name)
    const duplicateCount = counts.get(normalizedName) ?? 1

    const officialMatch = candidate.camaraId
      ? await db.person.findUnique({ where: { camaraId: candidate.camaraId } })
      : candidate.senadoId
        ? await db.person.findUnique({ where: { senadoId: candidate.senadoId } })
        : null

    const mayShareByName = duplicateCount === 1 || KNOWN_SHARED_IDENTITIES.has(normalizedName)
    let person = officialMatch

    if (!person && mayShareByName) {
      person = await db.person.findFirst({
        where: { normalizedName },
        orderBy: { createdAt: 'asc' },
      })
    }

    if (!person) {
      person = await db.person.create({
        data: {
          name: candidate.name,
          socialName: candidate.socialName,
          normalizedName,
          camaraId: candidate.camaraId,
          senadoId: candidate.senadoId,
          dataSource: candidate.dataSource === DataSource.TSE
            ? DataSource.TSE
            : DataSource.MIGRATION,
        },
      })
      metrics.peopleCreated++
    }

    if (!mayShareByName && !officialMatch) {
      const key = ambiguityKey(normalizedName, candidate.id)
      const existing = await db.reviewItem.findUnique({ where: { dedupeKey: key } })
      await db.reviewItem.upsert({
        where: { dedupeKey: key },
        update: {
          personId: person.id,
          reason: `Nome legado duplicado sem identificador oficial inequívoco: ${candidate.name}`,
        },
        create: {
          dedupeKey: key,
          kind: ReviewItemKind.IDENTITY_AMBIGUITY,
          source: DataSource.MIGRATION,
          reason: `Nome legado duplicado sem identificador oficial inequívoco: ${candidate.name}`,
          candidateId: candidate.id,
          personId: person.id,
          payload: { normalizedName, duplicateCount },
        },
      })
      if (!existing) metrics.reviewItemsCreated++
    }

    await db.candidate.update({
      where: { id: candidate.id },
      data: { personId: person.id },
    })
    metrics.candidatesLinked++
  }

  return metrics
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const metrics = await backfillLegacyPeople(prisma)
    logger.info('[backfill-persons] complete', metrics)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('[backfill-persons] fatal error', error)
    process.exit(1)
  })
}
