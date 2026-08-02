import {
  DataSource,
  OfficialCandidacyStatus,
  Position,
  type PrismaClient,
  ReviewItemKind,
  ReviewItemStatus,
} from '@prisma/client'

import { normalizePersonName } from '../../jobs/backfillPersons'
import type { TseCandidateRecord } from './candidateCsv'

export interface ImportTseCandidatesInput {
  records: TseCandidateRecord[]
  sourceUrl: string
  checksum: string
  syncRunId?: string
  syncedAt?: Date
  batchSize?: number
  dryRun?: boolean
}

export interface TseCandidateImportMetrics {
  parsed: number
  created: number
  matched: number
  updated: number
  ambiguous: number
  conflicts: number
  reviewItems: number
  published: number
  hidden: number
}

const POSITION_MAP: Readonly<Record<string, Position>> = {
  PRESIDENTE: Position.PRESIDENTE,
  VICE_PRESIDENTE: Position.VICE_PRESIDENTE,
  SENADOR: Position.SENADOR,
  PRIMEIRO_SUPLENTE: Position.PRIMEIRO_SUPLENTE,
  '1_SUPLENTE': Position.PRIMEIRO_SUPLENTE,
  SEGUNDO_SUPLENTE: Position.SEGUNDO_SUPLENTE,
  '2_SUPLENTE': Position.SEGUNDO_SUPLENTE,
  DEPUTADO_FEDERAL: Position.DEPUTADO_FEDERAL,
  DEPUTADO_ESTADUAL: Position.DEPUTADO_ESTADUAL,
  DEPUTADO_DISTRITAL: Position.DEPUTADO_DISTRITAL,
  GOVERNADOR: Position.GOVERNADOR,
  VICE_GOVERNADOR: Position.VICE_GOVERNADOR,
  PREFEITO: Position.PREFEITO,
  VEREADOR: Position.VEREADOR,
}

const PUBLIC_POSITIONS = new Set<Position>([
  Position.PRESIDENTE,
  Position.GOVERNADOR,
  Position.SENADOR,
])

function normalizeComparable(value: string): string {
  return normalizePersonName(value)
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function makeOfficialCandidateSlug(record: TseCandidateRecord): string {
  return [record.name, record.party, record.state, record.position, record.electionYear]
    .map((part) => slugify(String(part)))
    .join('-')
}

function officialStatus(status: TseCandidateRecord['normalizedStatus']): OfficialCandidacyStatus {
  return OfficialCandidacyStatus[status]
}

function isPublicCandidate(position: Position, status: OfficialCandidacyStatus): boolean {
  return PUBLIC_POSITIONS.has(position) && status === OfficialCandidacyStatus.ELIGIBLE
}

async function availableSlug(
  prisma: PrismaClient,
  record: TseCandidateRecord,
): Promise<string> {
  const base = makeOfficialCandidateSlug(record)
  const existing = await prisma.candidate.findUnique({ where: { slug: base }, select: { id: true } })
  return existing ? `${base}-${record.tseId.slice(-6)}` : base
}

interface PersonResolution {
  personId: string
  ambiguousMandates: boolean
}

function legislativeRole(position: Position): string | null {
  if (position === Position.SENADOR) return 'SENADOR'
  if (position === Position.DEPUTADO_FEDERAL) return 'DEPUTADO_FEDERAL'
  return null
}

async function resolveOrCreatePerson(
  prisma: PrismaClient,
  record: TseCandidateRecord,
  position: Position,
): Promise<PersonResolution> {
  const role = legislativeRole(position)
  if (role) {
    const mandates = await prisma.mandate.findMany({
      where: {
        role,
        party: record.party,
        state: record.state,
        person: { normalizedName: normalizePersonName(record.name) },
      },
      select: { personId: true },
    })
    const personIds = [...new Set(mandates.map((mandate) => mandate.personId))]
    if (personIds.length === 1) {
      const person = await prisma.person.update({
        where: { id: personIds[0] },
        data: {
          name: record.name,
          socialName: record.ballotName,
          normalizedName: normalizePersonName(record.name),
          dataSource: DataSource.TSE,
        },
        select: { id: true },
      })
      return { personId: person.id, ambiguousMandates: false }
    }

    if (personIds.length > 1) {
      const person = await prisma.person.create({
        data: {
          name: record.name,
          socialName: record.ballotName,
          normalizedName: normalizePersonName(record.name),
          dataSource: DataSource.TSE,
        },
        select: { id: true },
      })
      return { personId: person.id, ambiguousMandates: true }
    }
  }

  const person = await prisma.person.create({
    data: {
      name: record.name,
      socialName: record.ballotName,
      normalizedName: normalizePersonName(record.name),
      dataSource: DataSource.TSE,
    },
    select: { id: true },
  })
  return { personId: person.id, ambiguousMandates: false }
}

async function ensureCandidatePerson(
  prisma: PrismaClient,
  candidate: { id: string; personId: string | null },
  record: TseCandidateRecord,
  position: Position,
): Promise<PersonResolution> {
  if (candidate.personId) {
    return { personId: candidate.personId, ambiguousMandates: false }
  }
  const resolution = await resolveOrCreatePerson(prisma, record, position)
  await prisma.candidate.update({
    where: { id: candidate.id },
    data: { personId: resolution.personId },
  })
  return resolution
}

async function upsertReviewItem(
  prisma: PrismaClient,
  input: {
    record: TseCandidateRecord
    candidateId: string
    personId: string
    syncRunId?: string
    kind: ReviewItemKind
    reason: string
    checksum: string
  },
): Promise<boolean> {
  const dedupeKey = `tse:${input.kind}:${input.record.tseId}`
  const existing = await prisma.reviewItem.findUnique({ where: { dedupeKey }, select: { id: true } })
  await prisma.reviewItem.upsert({
    where: { dedupeKey },
    update: {
      status: ReviewItemStatus.OPEN,
      reason: input.reason,
      candidateId: input.candidateId,
      personId: input.personId,
      syncRunId: input.syncRunId,
      payload: { raw: input.record.raw, checksum: input.checksum },
    },
    create: {
      dedupeKey,
      kind: input.kind,
      source: DataSource.TSE,
      reason: input.reason,
      officialRecordId: input.record.tseId,
      candidateId: input.candidateId,
      personId: input.personId,
      syncRunId: input.syncRunId,
      payload: { raw: input.record.raw, checksum: input.checksum },
    },
  })
  return existing == null
}

export async function importTseCandidates(
  prisma: PrismaClient,
  input: ImportTseCandidatesInput,
): Promise<TseCandidateImportMetrics> {
  const metrics: TseCandidateImportMetrics = {
    parsed: input.records.length,
    created: 0,
    matched: 0,
    updated: 0,
    ambiguous: 0,
    conflicts: 0,
    reviewItems: 0,
    published: 0,
    hidden: 0,
  }
  if (input.dryRun) return metrics

  const syncedAt = input.syncedAt ?? new Date()
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 250, 1_000))

  for (let offset = 0; offset < input.records.length; offset += batchSize) {
    const batch = input.records.slice(offset, offset + batchSize)

    for (const record of batch) {
      const position = POSITION_MAP[record.position]
      if (!position) {
        metrics.hidden++
        continue
      }
      const status = officialStatus(record.normalizedStatus)
      const policyPublished = isPublicCandidate(position, status)
      const existingOfficial = await prisma.candidate.findUnique({
        where: { tseId: record.tseId },
        select: { id: true, personId: true, isPublished: true },
      })

      if (existingOfficial) {
        const openReview = await prisma.reviewItem.findFirst({
          where: { candidateId: existingOfficial.id, status: ReviewItemStatus.OPEN },
          select: { id: true },
        })
        const personResolution = await ensureCandidatePerson(
          prisma,
          existingOfficial,
          record,
          position,
        )
        const isPublished = policyPublished && !openReview && !personResolution.ambiguousMandates
        await prisma.candidate.update({
          where: { id: existingOfficial.id },
          data: {
            personId: personResolution.personId,
            name: record.name,
            socialName: record.ballotName,
            party: record.party,
            state: record.state,
            position,
            ballotNumber: record.ballotNumber,
            electionYear: record.electionYear,
            electionId: record.electionId,
            isOfficial: true,
            officialStatus: status,
            officialStatusRaw: record.rawStatus,
            isPublished,
            dataSource: DataSource.TSE,
            sourceUrl: input.sourceUrl,
            lastSyncedAt: syncedAt,
            syncRunId: input.syncRunId,
          },
        })
        if (personResolution.ambiguousMandates) {
          if (await upsertReviewItem(prisma, {
            record,
            candidateId: existingOfficial.id,
            personId: personResolution.personId,
            syncRunId: input.syncRunId,
            kind: ReviewItemKind.IDENTITY_AMBIGUITY,
            reason: `Mais de um mandato corresponde ao registro TSE ${record.tseId}`,
            checksum: input.checksum,
          })) metrics.reviewItems++
          metrics.ambiguous++
        }
        metrics.updated++
        isPublished ? metrics.published++ : metrics.hidden++
        continue
      }

      const candidatesForOffice = await prisma.candidate.findMany({
        where: {
          electionYear: record.electionYear,
          position,
          tseId: null,
        },
        select: {
          id: true,
          personId: true,
          name: true,
          party: true,
          state: true,
        },
      })
      const sameName = candidatesForOffice.filter(
        (candidate) => normalizeComparable(candidate.name) === normalizeComparable(record.name),
      )
      const exactMatches = sameName.filter(
        (candidate) =>
          normalizeComparable(candidate.party) === normalizeComparable(record.party) &&
          candidate.state.toUpperCase() === record.state.toUpperCase(),
      )

      if (exactMatches.length === 1) {
        const match = exactMatches[0]
        const personResolution = await ensureCandidatePerson(prisma, match, record, position)
        const isPublished = policyPublished && !personResolution.ambiguousMandates
        await prisma.candidate.update({
          where: { id: match.id },
          data: {
            personId: personResolution.personId,
            tseId: record.tseId,
            name: record.name,
            socialName: record.ballotName,
            party: record.party,
            state: record.state,
            ballotNumber: record.ballotNumber,
            electionId: record.electionId,
            isOfficial: true,
            officialStatus: status,
            officialStatusRaw: record.rawStatus,
            isPublished,
            dataSource: DataSource.TSE,
            sourceUrl: input.sourceUrl,
            lastSyncedAt: syncedAt,
            syncRunId: input.syncRunId,
          },
        })
        if (personResolution.ambiguousMandates) {
          if (await upsertReviewItem(prisma, {
            record,
            candidateId: match.id,
            personId: personResolution.personId,
            syncRunId: input.syncRunId,
            kind: ReviewItemKind.IDENTITY_AMBIGUITY,
            reason: `Mais de um mandato corresponde ao registro TSE ${record.tseId}`,
            checksum: input.checksum,
          })) metrics.reviewItems++
          metrics.ambiguous++
        }
        metrics.matched++
        isPublished ? metrics.published++ : metrics.hidden++
        continue
      }

      const personResolution = await resolveOrCreatePerson(prisma, record, position)
      const needsEditorialReview = exactMatches.length > 1 || sameName.length > 0
      const needsReview = needsEditorialReview || personResolution.ambiguousMandates
      const slug = await availableSlug(prisma, record)
      const created = await prisma.candidate.create({
        data: {
          personId: personResolution.personId,
          tseId: record.tseId,
          slug,
          name: record.name,
          socialName: record.ballotName,
          party: record.party,
          state: record.state,
          position,
          ballotNumber: record.ballotNumber,
          electionYear: record.electionYear,
          electionId: record.electionId,
          isOfficial: true,
          officialStatus: status,
          officialStatusRaw: record.rawStatus,
          isPublished: needsReview ? false : policyPublished,
          dataSource: DataSource.TSE,
          sourceUrl: input.sourceUrl,
          lastSyncedAt: syncedAt,
          syncRunId: input.syncRunId,
          partyHistory: [],
        },
        select: { id: true, isPublished: true },
      })
      metrics.created++

      if (needsReview) {
        const kind = exactMatches.length > 1 || personResolution.ambiguousMandates
          ? ReviewItemKind.IDENTITY_AMBIGUITY
          : ReviewItemKind.CANDIDACY_CONFLICT
        const reason = exactMatches.length > 1
          ? `Mais de uma candidatura editorial corresponde ao registro TSE ${record.tseId}`
          : personResolution.ambiguousMandates
            ? `Mais de um mandato corresponde ao registro TSE ${record.tseId}`
            : `Registro TSE ${record.tseId} conflita com partido ou UF editorial`
        if (await upsertReviewItem(prisma, {
          record,
          candidateId: created.id,
          personId: personResolution.personId,
          syncRunId: input.syncRunId,
          kind,
          reason,
          checksum: input.checksum,
        })) metrics.reviewItems++
        exactMatches.length > 1 || personResolution.ambiguousMandates
          ? metrics.ambiguous++
          : metrics.conflicts++
      }

      created.isPublished ? metrics.published++ : metrics.hidden++
    }
  }

  return metrics
}
