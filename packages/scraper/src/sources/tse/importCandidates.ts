import { DataSource, OfficialCandidacyStatus, Position, type PrismaClient, ReviewItemKind, ReviewItemStatus } from '@prisma/client'

import { normalizePersonName } from '../../jobs/backfillPersons'
import {
  resolveTseCandidateJudgments,
  type TseComplementRow,
} from './candidacyStatus'
import type { TseCandidateRecord } from './candidateCsv'

export interface ImportTseCandidatesInput {
  records: TseCandidateRecord[]
  sourceUrl: string
  checksum: string
  syncRunId?: string
  syncedAt?: Date
  batchSize?: number
  dryRun?: boolean
  complementRows?: readonly TseComplementRow[]
  complementSourceUrl?: string
  requireComplementJudgment?: boolean
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
  /** Pré-candidaturas editoriais despublicadas por não constarem no snapshot. */
  unregistered: number
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
  VICE_PREFEITO: Position.VICE_PREFEITO,
  VEREADOR: Position.VEREADOR,
}

const PUBLIC_POSITIONS = new Set<Position>([
  Position.PRESIDENTE,
  Position.GOVERNADOR,
  Position.SENADOR,
])

// Cargos disputados na circunscrição nacional: o TSE grava SG_UF = 'BR', mas o
// catálogo editorial guarda a UF de origem do político (Lula/SP, Caiado/GO).
// A UF não distingue candidaturas aqui, só produz falso negativo no match.
const NATIONAL_POSITIONS = new Set<Position>([
  Position.PRESIDENTE,
  Position.VICE_PRESIDENTE,
])

// Publicar exige candidatura registrada e não rejeitada. Logo após o prazo de
// registro a quase totalidade das candidaturas fica pendente de julgamento —
// tratá-las como não publicáveis esvaziaria o site por semanas.
const PUBLISHABLE_STATUSES = new Set<OfficialCandidacyStatus>([
  OfficialCandidacyStatus.ELIGIBLE,
  OfficialCandidacyStatus.PENDING,
])

// O TSE publica a sigla registrada; o catálogo editorial usa o nome corrente.
const PARTY_ALIASES: Readonly<Record<string, string>> = {
  UNIAOBRASIL: 'UNIAO',
  PARTIDONOVO: 'NOVO',
}

function normalizeComparable(value: string): string {
  return normalizePersonName(value)
}

function normalizeParty(value: string): string {
  const token = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
  return PARTY_ALIASES[token] ?? token
}

function identityTokens(...values: Array<string | null>): Set<string> {
  return new Set(
    values.flatMap((value) => {
      if (!value) return []
      const normalized = normalizeComparable(value)
      return normalized ? [normalized] : []
    }),
  )
}

/**
 * O seed editorial usa o nome pelo qual o candidato é conhecido — que é o
 * `NM_URNA_CANDIDATO` do TSE, não o `NM_CANDIDATO` civil ("Flávio Bolsonaro"
 * contra "FLÁVIO NANTES BOLSONARO"). Comparar os dois lados por nome civil e
 * nome de urna evita duplicar a candidatura.
 */
function sharesIdentity(
  candidate: { name: string; socialName: string | null },
  record: TseCandidateRecord,
): boolean {
  const official = identityTokens(record.name, record.ballotName)
  for (const token of identityTokens(candidate.name, candidate.socialName)) {
    if (official.has(token)) return true
  }
  return false
}

function sharesElectoralUnit(
  candidateState: string,
  record: TseCandidateRecord,
  position: Position,
): boolean {
  if (NATIONAL_POSITIONS.has(position)) return true
  return candidateState.toUpperCase() === record.state.toUpperCase()
}

// DS_SITUACAO_CANDIDATURA sozinho não distingue indeferido de sub judice; o
// detalhe carrega essa informação quando o TSE a publica.
function combinedRawStatus(record: TseCandidateRecord): string {
  return record.rawStatusDetail && record.rawStatusDetail !== record.rawStatus
    ? `${record.rawStatus} / ${record.rawStatusDetail}`
    : record.rawStatus
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

function legacyCandidacyStatus(record: TseCandidateRecord): string {
  const raw = normalizeComparable(record.rawStatus)
  if (raw.includes('substituid')) return 'substituido'
  if (raw.includes('renuncia') || raw.includes('desist')) return 'desistiu'
  if (raw.includes('indeferid')) return 'indeferido'
  if (raw.includes('deferid')) return 'deferido'
  if (raw.includes('cancelad')) return 'cancelado'
  if (raw.includes('cassad')) return 'cassado'
  if (raw.includes('falec')) return 'falecido'
  if (
    record.normalizedStatus === 'ELIGIBLE' ||
    record.normalizedStatus === 'PENDING'
  ) return 'registro_solicitado'
  return 'status_nao_mapeado'
}

function isPublicCandidate(position: Position, status: OfficialCandidacyStatus): boolean {
  return PUBLIC_POSITIONS.has(position) && PUBLISHABLE_STATUSES.has(status)
}

async function availableSlug(
  prisma: PrismaClient,
  record: TseCandidateRecord,
): Promise<string> {
  const base = makeOfficialCandidateSlug(record)
  const existing = await prisma.candidate.findFirst({ where: { slug: base }, select: { id: true } })
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
          socialName: record.socialName,
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
          socialName: record.socialName,
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
      socialName: record.socialName,
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
    unregistered: 0,
    ambiguous: 0,
    conflicts: 0,
    reviewItems: 0,
    published: 0,
    hidden: 0,
  }
  if (input.dryRun) return metrics

  const syncedAt = input.syncedAt ?? new Date()
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 250, 1_000))
  const judgments = resolveTseCandidateJudgments(input.complementRows ?? [])

  for (let offset = 0; offset < input.records.length; offset += batchSize) {
    const batch = input.records.slice(offset, offset + batchSize)

    for (const record of batch) {
      const position = POSITION_MAP[record.position]
      if (!position) {
        metrics.hidden++
        continue
      }
      const judgment = judgments.get(record.tseId)
      const missingRequiredJudgment = input.requireComplementJudgment === true && !judgment
      const status = missingRequiredJudgment
        ? OfficialCandidacyStatus.UNKNOWN
        : judgment?.officialStatus ?? officialStatus(record.normalizedStatus)
      const candidacyStatus = missingRequiredJudgment
        ? 'status_nao_mapeado'
        : judgment?.candidacyStatus ?? legacyCandidacyStatus(record)
      const statusRaw = missingRequiredJudgment
        ? '#NE'
        : judgment?.rawStatus ?? combinedRawStatus(record)
      const statusSourceUrl = input.requireComplementJudgment || judgment
        ? input.complementSourceUrl ?? input.sourceUrl
        : input.sourceUrl
      const statusNeedsReview = missingRequiredJudgment || judgment?.ambiguous === true
      const statusReviewReason = missingRequiredJudgment
        ? `Complemento TSE ausente para ${record.tseId}`
        : `Complemento TSE conflitante para ${record.tseId}`
      const policyPublished = isPublicCandidate(position, status)
      const existingOfficial = await prisma.candidate.findUnique({
        where: { tseId: record.tseId },
        select: {
          id: true,
          personId: true,
          name: true,
          socialName: true,
          party: true,
          state: true,
          position: true,
          ballotNumber: true,
          electionYear: true,
          electionId: true,
          isOfficial: true,
          officialStatus: true,
          officialStatusRaw: true,
          isPublished: true,
          candidacyStatus: true,
          candidacyStatusSourceUrl: true,
          dataSource: true,
          sourceUrl: true,
        },
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
        const isPublished =
          policyPublished && !openReview && !personResolution.ambiguousMandates && !statusNeedsReview
        const materialChanged =
          existingOfficial.personId !== personResolution.personId ||
          existingOfficial.name !== record.name ||
          existingOfficial.socialName !== record.socialName ||
          existingOfficial.party !== record.party ||
          existingOfficial.state !== record.state ||
          existingOfficial.position !== position ||
          existingOfficial.ballotNumber !== record.ballotNumber ||
          existingOfficial.electionYear !== record.electionYear ||
          existingOfficial.electionId !== record.electionId ||
          existingOfficial.isOfficial !== true ||
          existingOfficial.officialStatus !== status ||
          existingOfficial.officialStatusRaw !== statusRaw ||
          existingOfficial.candidacyStatus !== candidacyStatus ||
          existingOfficial.candidacyStatusSourceUrl !== statusSourceUrl ||
          existingOfficial.isPublished !== isPublished ||
          existingOfficial.dataSource !== DataSource.TSE ||
          existingOfficial.sourceUrl !== input.sourceUrl
        await prisma.candidate.update({
          where: { id: existingOfficial.id },
          data: {
            personId: personResolution.personId,
            name: record.name,
            socialName: record.socialName,
            party: record.party,
            state: record.state,
            position,
            ballotNumber: record.ballotNumber,
            electionYear: record.electionYear,
            electionId: record.electionId,
            isOfficial: true,
            officialStatus: status,
            officialStatusRaw: statusRaw,
            candidacyStatus,
            candidacyStatusSourceUrl: statusSourceUrl,
            candidacyStatusVerifiedAt: syncedAt,
            ...(materialChanged ? { materialUpdatedAt: syncedAt } : {}),
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
        if (statusNeedsReview) {
          if (await upsertReviewItem(prisma, {
            record,
            candidateId: existingOfficial.id,
            personId: personResolution.personId,
            syncRunId: input.syncRunId,
            kind: ReviewItemKind.SOURCE_DATA_ERROR,
            reason: statusReviewReason,
            checksum: input.checksum,
          })) metrics.reviewItems++
          metrics.conflicts++
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
          socialName: true,
          party: true,
          state: true,
          candidacyStatus: true,
        },
      })
      const sameName = candidatesForOffice.filter(
        (candidate) => sharesIdentity(candidate, record),
      )
      const exactMatches = sameName.filter(
        (candidate) =>
          normalizeParty(candidate.party) === normalizeParty(record.party) &&
          sharesElectoralUnit(candidate.state, record, position),
      )

      // Um único homônimo com o mesmo partido e unidade eleitoral é a mesma
      // pessoa: promova a ficha editorial em vez de duplicá-la. Qualquer outro
      // caso cai no fallback conservador abaixo.
      if (exactMatches.length === 1) {
        const match = exactMatches[0]
        const personResolution = await ensureCandidatePerson(prisma, match, record, position)
        const isPublished =
          policyPublished && !personResolution.ambiguousMandates && !statusNeedsReview
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
            officialStatusRaw: statusRaw,
            candidacyStatus,
            candidacyStatusSourceUrl: statusSourceUrl,
            candidacyStatusVerifiedAt: syncedAt,
            materialUpdatedAt: syncedAt,
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
      // Nome, partido e UF não provam identidade. Se já existe qualquer linha
      // editorial homônima, crie uma candidatura oficial separada e bloqueada
      // para reconciliação explícita; nunca promova o registro legado por nome.
      const needsEditorialReview = sameName.length > 0
      const identityAmbiguous = sameName.length > 1 || personResolution.ambiguousMandates
      const needsReview = needsEditorialReview || identityAmbiguous || statusNeedsReview
      // Reconciliar identidade e existir como candidatura são perguntas
      // diferentes. Um único homônimo editorial — o caso de quem trocou de
      // partido entre o seed e o registro — deixa em aberto qual ficha é a
      // mesma pessoa, não se a candidatura oficial existe: ela veio do TSE.
      // Ocultá-la por isso apagaria do site um candidato registrado, ainda
      // mais agora que a ficha editorial homônima é despublicada ao final.
      // Ambiguidade real (mais de um homônimo, mandatos conflitantes) ou
      // julgamento pendente continuam bloqueando a publicação.
      const blocksPublication = identityAmbiguous || statusNeedsReview
      const slug = await availableSlug(prisma, record)
      const created = await prisma.candidate.create({
        data: {
          personId: personResolution.personId,
          tseId: record.tseId,
          slug,
          name: record.name,
          socialName: record.socialName,
          party: record.party,
          state: record.state,
          position,
          ballotNumber: record.ballotNumber,
          electionYear: record.electionYear,
          electionId: record.electionId,
          isOfficial: true,
          officialStatus: status,
          officialStatusRaw: statusRaw,
          candidacyStatus,
          candidacyStatusSourceUrl: statusSourceUrl,
          candidacyStatusVerifiedAt: syncedAt,
          materialUpdatedAt: syncedAt,
          isPublished: blocksPublication ? false : policyPublished,
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
        const kind = statusNeedsReview
          ? ReviewItemKind.SOURCE_DATA_ERROR
          : identityAmbiguous
            ? ReviewItemKind.IDENTITY_AMBIGUITY
            : ReviewItemKind.CANDIDACY_CONFLICT
        const reason = statusNeedsReview
          ? statusReviewReason
          : personResolution.ambiguousMandates
          ? `Mais de um mandato corresponde ao registro TSE ${record.tseId}`
          : sameName.length > 1
            ? `Mais de um homônimo editorial corresponde ao registro TSE ${record.tseId}`
          : `Registro TSE ${record.tseId} possui homônimo editorial e exige reconciliação explícita`
        if (await upsertReviewItem(prisma, {
          record,
          candidateId: created.id,
          personId: personResolution.personId,
          syncRunId: input.syncRunId,
          kind,
          reason,
          checksum: input.checksum,
        })) metrics.reviewItems++
        identityAmbiguous ? metrics.ambiguous++ : metrics.conflicts++
      }

      created.isPublished ? metrics.published++ : metrics.hidden++
    }
  }

  const replacedIds = new Set(
    [...judgments.values()]
      .map((judgment) => judgment.replacesCandidateId)
      .filter((value): value is string => Boolean(value)),
  )
  const activeStatuses = new Set(['registro_solicitado', 'deferido'])
  const activeSlateMember = (record: TseCandidateRecord): boolean => {
    const judgment = judgments.get(record.tseId)
    if (input.requireComplementJudgment === true && !judgment) return false
    return activeStatuses.has(judgment?.candidacyStatus ?? legacyCandidacyStatus(record))
  }
  const presidents = input.records.filter((record) => record.position === 'PRESIDENTE')
  for (const president of presidents) {
    const coalitionKey = president.raw.SQ_COLIGACAO
    const presidentActive =
      !replacedIds.has(president.tseId) &&
      activeSlateMember(president)
    const runningMates = presidentActive && coalitionKey
      ? input.records.filter(
          (record) =>
            record.position === 'VICE_PRESIDENTE' &&
            record.raw.SQ_COLIGACAO === coalitionKey &&
            !replacedIds.has(record.tseId) &&
            activeSlateMember(record),
        )
      : []
    const runningMate = runningMates.length === 1 ? runningMates[0] : null
    const runningMateName = runningMate?.name ?? null
    const runningMateParty = runningMate?.party ?? null
    const runningMateSourceUrl = runningMate
      ? judgments.has(runningMate.tseId)
        ? input.complementSourceUrl ?? input.sourceUrl
        : input.sourceUrl
      : null
    const candidate = await prisma.candidate.findUnique({
      where: { tseId: president.tseId },
      select: {
        id: true,
        runningMateName: true,
        runningMateParty: true,
        runningMateSourceUrl: true,
      },
    })
    if (!candidate) continue
    const materialChanged =
      candidate.runningMateName !== runningMateName ||
      candidate.runningMateParty !== runningMateParty ||
      candidate.runningMateSourceUrl !== runningMateSourceUrl
    if (!materialChanged) continue

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        runningMateName,
        runningMateParty,
        runningMateSourceUrl,
        materialUpdatedAt: syncedAt,
      },
    })
  }

  // Encerrado o prazo de registro, uma pré-candidatura editorial que o snapshot
  // não reconciliou deixa de ser candidatura: continua armazenada, com o
  // histórico intacto, mas sai do ar em vez de anunciar como concorrente quem
  // não disputa. O corte é por cargo/ano efetivamente presentes no snapshot —
  // um recorte parcial nunca pode despublicar um cargo que ele não cobriu, que
  // é a garantia registrada no runbook.
  if (!input.dryRun && input.records.length > 0) {
    const covered = new Map<number, Set<Position>>()
    for (const record of input.records) {
      const position = POSITION_MAP[record.position]
      if (!position) continue
      const positions = covered.get(record.electionYear)
      if (positions) positions.add(position)
      else covered.set(record.electionYear, new Set([position]))
    }

    for (const [electionYear, positions] of covered) {
      const { count } = await prisma.candidate.updateMany({
        where: {
          electionYear,
          position: { in: [...positions] },
          tseId: null,
          isOfficial: false,
          isPublished: true,
        },
        data: {
          isPublished: false,
          candidacyStatus: 'nao_registrado',
          candidacyStatusSourceUrl: input.sourceUrl,
          candidacyStatusVerifiedAt: syncedAt,
          materialUpdatedAt: syncedAt,
        },
      })
      metrics.unregistered += count
    }
  }

  return metrics
}
