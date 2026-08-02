import {
  DataSource,
  type MandateHouse,
  type PrismaClient,
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

export async function upsertLegislatorMandate(
  prisma: PrismaClient,
  input: LegislatorMandateInput,
): Promise<LegislatorMandateIds> {
  const personData = {
    name: input.name,
    socialName: input.socialName,
    normalizedName: normalizePersonName(input.name),
    dataSource: input.source,
    sourceUrl: input.sourceUrl,
    lastSyncedAt: input.syncedAt,
  }
  const person = input.source === DataSource.CAMARA
    ? await prisma.person.upsert({
        where: { camaraId: input.externalId },
        update: personData,
        create: { ...personData, camaraId: input.externalId },
        select: { id: true },
      })
    : await prisma.person.upsert({
        where: { senadoId: input.externalId },
        update: personData,
        create: { ...personData, senadoId: input.externalId },
        select: { id: true },
      })

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
