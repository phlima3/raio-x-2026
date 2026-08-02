import {
  DataSource,
  type MandateHouse,
  Position,
  type PrismaClient,
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

  return { personId: person.id, mandateId: mandate.id }
}
