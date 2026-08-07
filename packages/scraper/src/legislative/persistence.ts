import {
  DataSource,
  type MandateHouse,
  Position,
  type PrismaClient,
  ProposalOrigin,
  ReviewItemKind,
} from '@prisma/client'

import { normalizePersonName } from '../jobs/backfillPersons'

export interface LegislatorMandateInput {
  source: Extract<DataSource, 'CAMARA' | 'SENADO'>
  house: MandateHouse
  externalId: string
  legislatureId: string
  name: string
  socialName: string | null
  party: string
  state: string
  role: string
  sourceUrl: string
  syncedAt: Date
  startDate?: Date | null
  endDate?: Date | null
  isCurrent?: boolean
}

export interface LegislatorMandateIds {
  personId: string
  mandateId: string
}

function candidacyPosition(role: string): Position | null {
  if (role === 'SENADOR') return Position.SENADOR
  if (role === 'DEPUTADO_FEDERAL') return Position.DEPUTADO_FEDERAL
  return null
}

async function upsertLegislatorPerson(
  prisma: PrismaClient,
  input: LegislatorMandateInput,
): Promise<{ id: string }> {
  const normalizedName = normalizePersonName(input.name)
  const personData = {
    name: input.name,
    socialName: input.socialName,
    normalizedName,
    dataSource: input.source,
    sourceUrl: input.sourceUrl,
    lastSyncedAt: input.syncedAt,
  }
  const existing = input.source === DataSource.CAMARA
    ? await prisma.person.findUnique({ where: { camaraId: input.externalId }, select: { id: true } })
    : await prisma.person.findUnique({ where: { senadoId: input.externalId }, select: { id: true } })
  if (existing) {
    return prisma.person.update({ where: { id: existing.id }, data: personData, select: { id: true } })
  }

  const position = candidacyPosition(input.role)
  const linkedCandidates = position
    ? await prisma.candidate.findMany({
        where: {
          position,
          party: input.party,
          state: input.state,
          person: { normalizedName },
        },
        select: { personId: true },
      })
    : []
  const personIds = [...new Set(
    linkedCandidates.flatMap((candidate) => candidate.personId ? [candidate.personId] : []),
  )]
  if (personIds.length === 1) {
    return prisma.person.update({
      where: { id: personIds[0] },
      data: {
        ...personData,
        ...(input.source === DataSource.CAMARA
          ? { camaraId: input.externalId }
          : { senadoId: input.externalId }),
      },
      select: { id: true },
    })
  }

  const person = await prisma.person.create({
    data: {
      ...personData,
      ...(input.source === DataSource.CAMARA
        ? { camaraId: input.externalId }
        : { senadoId: input.externalId }),
    },
    select: { id: true },
  })
  if (personIds.length > 1) {
    await prisma.reviewItem.upsert({
      where: { dedupeKey: `legislative:${input.source}:${input.externalId}:identity` },
      update: {
        reason: `Mais de uma pessoa candidata corresponde ao identificador legislativo ${input.externalId}`,
        personId: person.id,
        payload: { name: input.name, party: input.party, state: input.state, role: input.role },
      },
      create: {
        dedupeKey: `legislative:${input.source}:${input.externalId}:identity`,
        kind: ReviewItemKind.IDENTITY_AMBIGUITY,
        source: input.source,
        reason: `Mais de uma pessoa candidata corresponde ao identificador legislativo ${input.externalId}`,
        officialRecordId: input.externalId,
        personId: person.id,
        payload: { name: input.name, party: input.party, state: input.state, role: input.role },
      },
    })
  }
  return person
}

export async function upsertLegislatorMandate(
  prisma: PrismaClient,
  input: LegislatorMandateInput,
): Promise<LegislatorMandateIds> {
  const person = await upsertLegislatorPerson(prisma, input)

  const mandate = await prisma.mandate.upsert({
    where: {
      source_externalId_legislatureId: {
        source: input.source,
        externalId: input.externalId,
        legislatureId: input.legislatureId,
      },
    },
    update: {
      personId: person.id,
      house: input.house,
      role: input.role,
      state: input.state,
      party: input.party,
      startDate: input.startDate,
      endDate: input.endDate,
      isCurrent: input.isCurrent ?? true,
      sourceUrl: input.sourceUrl,
      lastSyncedAt: input.syncedAt,
    },
    create: {
      personId: person.id,
      source: input.source,
      externalId: input.externalId,
      legislatureId: input.legislatureId,
      house: input.house,
      role: input.role,
      state: input.state,
      party: input.party,
      startDate: input.startDate,
      endDate: input.endDate,
      isCurrent: input.isCurrent ?? true,
      sourceUrl: input.sourceUrl,
      lastSyncedAt: input.syncedAt,
    },
    select: { id: true },
  })

  // Expand-and-migrate: keep the legacy Candidate relation for compatible
  // responses, while attaching historical rows to the normalized identity.
  // The source sync creates the mandate before inserting current votes, so
  // this also prevents the same official vote being inserted a second time.
  const legacyVoteWhere = {
    source: input.source.toLowerCase(),
    mandateId: null,
    candidate: { personId: person.id },
    ...(input.startDate || input.endDate
      ? {
          votedAt: {
            ...(input.startDate ? { gte: input.startDate } : {}),
            ...(input.endDate ? { lte: input.endDate } : {}),
          },
        }
      : {}),
  }
  const legacyVotes = await prisma.votingRecord.findMany({
    where: legacyVoteWhere,
    orderBy: { id: 'asc' },
    select: { id: true, externalId: true },
  })
  const officialVoteIds = [
    ...new Set(
      legacyVotes
        .map((vote) => vote.externalId)
        .filter((externalId): externalId is string => externalId !== null),
    ),
  ]
  const alreadyNormalized =
    officialVoteIds.length === 0
      ? []
      : await prisma.votingRecord.findMany({
          where: {
            source: input.source.toLowerCase(),
            mandateId: mandate.id,
            externalId: { in: officialVoteIds },
          },
          select: { externalId: true },
        })
  const claimedOfficialVoteIds = new Set(
    alreadyNormalized
      .map((vote) => vote.externalId)
      .filter((externalId): externalId is string => externalId !== null),
  )
  const identityOnlyVoteIds: string[] = []
  const migratableVoteIds = legacyVotes.flatMap((vote) => {
    // PostgreSQL permits multiple nulls in this unique key. For a real
    // official ID, keep the compatible legacy row untouched when its
    // normalized counterpart already exists instead of deleting or merging it.
    if (vote.externalId !== null && claimedOfficialVoteIds.has(vote.externalId)) {
      identityOnlyVoteIds.push(vote.id)
      return []
    }
    if (vote.externalId !== null) claimedOfficialVoteIds.add(vote.externalId)
    return [vote.id]
  })

  if (migratableVoteIds.length > 0) {
    await prisma.votingRecord.updateMany({
      where: { id: { in: migratableVoteIds } },
      data: { personId: person.id, mandateId: mandate.id },
    })
  }
  if (identityOnlyVoteIds.length > 0) {
    await prisma.votingRecord.updateMany({
      where: { id: { in: identityOnlyVoteIds } },
      data: { personId: person.id },
    })
  }

  const legacyProposals = await prisma.proposal.findMany({
    where: {
      source: { equals: input.source.toLowerCase(), mode: 'insensitive' },
      candidate: { personId: person.id },
      ...(input.startDate || input.endDate
        ? {
            OR: [
              { proposedAt: null },
              {
                proposedAt: {
                  ...(input.startDate ? { gte: input.startDate } : {}),
                  ...(input.endDate ? { lte: input.endDate } : {}),
                },
              },
            ],
          }
        : {}),
    },
  })
  for (const proposal of legacyProposals) {
    const externalId = proposal.externalId ?? `legacy:${proposal.id}`
    const bill = await prisma.legislativeBill.upsert({
      where: { source_externalId: { source: input.source, externalId } },
      update: {
        title: proposal.title,
        description: proposal.description,
        summary: proposal.summary,
        status: proposal.status,
        introducedAt: proposal.proposedAt,
        url: proposal.url,
        tags: proposal.tags,
      },
      create: {
        source: input.source,
        externalId,
        title: proposal.title,
        description: proposal.description,
        summary: proposal.summary,
        status: proposal.status,
        introducedAt: proposal.proposedAt,
        url: proposal.url,
        tags: proposal.tags,
      },
      select: { id: true },
    })
    await prisma.legislativeBillAuthor.upsert({
      where: {
        legislativeBillId_mandateId: {
          legislativeBillId: bill.id,
          mandateId: mandate.id,
        },
      },
      update: {},
      create: { legislativeBillId: bill.id, mandateId: mandate.id },
    })
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { isPublished: false, origin: ProposalOrigin.LEGACY },
    })
  }

  return { personId: person.id, mandateId: mandate.id }
}
