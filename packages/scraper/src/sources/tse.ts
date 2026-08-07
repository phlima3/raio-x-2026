import 'dotenv/config'
import axios from 'axios'
import AdmZip from 'adm-zip'
import { Candidate, Position, Prisma, PrismaClient } from '@prisma/client'
import type { CandidacyStatus } from '../processors/presidentialExtractor'
import { shouldAcceptIncomingStatus } from '../domain/candidacyStatus'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { logger } from '../utils/logger'
import { revalidateCandidatePages } from '../utils/revalidateWeb'

const prisma = new PrismaClient()

export const TSE_CANDIDATES_DATASET_URL =
  'https://dadosabertos.tse.jus.br/dataset/candidatos-2026'

function candidateZipUrl(year: number): string {
  return (
    process.env.TSE_CANDIDATES_ZIP_URL ??
    `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${year}.zip`
  )
}

function candidateComplementZipUrl(year: number): string {
  return (
    process.env.TSE_CANDIDATES_COMPLEMENT_ZIP_URL ??
    `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_${year}.zip`
  )
}

const POSITION_BY_TSE_LABEL: Record<string, Position | undefined> = {
  PRESIDENTE: Position.PRESIDENTE,
  'VICE-PRESIDENTE': Position.VICE_PRESIDENTE,
  GOVERNADOR: Position.GOVERNADOR,
  'VICE-GOVERNADOR': Position.VICE_GOVERNADOR,
  SENADOR: Position.SENADOR,
}

export interface TseCandidateRecord {
  tseId: string
  name: string
  socialName: string | null
  party: string
  state: string
  position: Position
  ballotNumber: number | null
  candidacyStatus: CandidacyStatus
  coalitionKey: string | null
  coalitionName: string | null
  generatedAt: string | null
  replacesCandidateId: string | null
}

export interface TseCandidateJudgment {
  tseId: string
  candidacyStatus: CandidacyStatus
  judgmentLabel: string | null
  detailLabel: string | null
  substituted: boolean
  replacesCandidateId: string | null
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

function nullableTseValue(value: string | undefined): string | null {
  const clean = value?.trim()
  if (!clean || clean === '#NULO' || clean === '#NE' || clean === '-1') return null
  return clean
}

export function mapTseCandidacyStatus(value: string): CandidacyStatus {
  const status = normalizeText(value)
  if (status.includes('SUBSTITUID')) return 'substituido'
  if (status.includes('RENUNC')) return 'desistiu'
  if (status.includes('INDEFERID')) return 'indeferido'
  if (status.includes('DEFERID')) return 'deferido'
  // A presença no conjunto oficial comprova o protocolo somente para os
  // rótulos genéricos conhecidos; INAPTO e novidades falham fechado.
  if (['', '#NE', '#NULO', 'APTO', 'CADASTRADO'].includes(status)) {
    return 'registro_solicitado'
  }
  return 'status_nao_mapeado'
}

export function mapTseJudgmentStatus(input: {
  judgment?: string
  detail?: string
  substituted?: string
}): CandidacyStatus {
  const substituted = normalizeText(input.substituted ?? '') === 'S'
  const evidence = `${input.judgment ?? ''} ${input.detail ?? ''}`
  const normalizedEvidence = normalizeText(evidence)

  if (substituted || normalizedEvidence.includes('SUBSTITUID')) return 'substituido'
  if (normalizedEvidence.includes('PEDIDO NAO CONHECIDO')) return 'pedido_nao_conhecido'
  if (normalizedEvidence.includes('CANCELAD')) return 'cancelado'
  if (normalizedEvidence.includes('CASSAD')) return 'cassado'
  if (normalizedEvidence.includes('FALEC')) return 'falecido'

  const mapped = mapTseCandidacyStatus(evidence)
  if (mapped !== 'registro_solicitado' && mapped !== 'status_nao_mapeado') {
    return mapped
  }

  if (/(^|\s)INAPTO($|\s)/.test(normalizedEvidence)) {
    return 'status_nao_mapeado'
  }

  if (
    !normalizedEvidence ||
    normalizedEvidence.includes('#NE') ||
    normalizedEvidence.includes('#NULO') ||
    normalizedEvidence.includes('AGUARDANDO JULGAMENTO') ||
    normalizedEvidence.includes('PENDENTE') ||
    normalizedEvidence.includes('CADASTRADO') ||
    /(^|\s)APTO($|\s)/.test(normalizedEvidence)
  ) {
    return 'registro_solicitado'
  }

  // Um rótulo judicial inesperado não pode herdar um estado qualificante.
  return 'status_nao_mapeado'
}

export function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (character === ';' && !inQuotes) {
      values.push(current)
      current = ''
    } else if (character !== '\r') {
      current += character
    }
  }
  values.push(current)
  return values
}

export function parseTseCandidatesCsv(csv: string, year: number): TseCandidateRecord[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return []
  const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, ''))
  const results: TseCandidateRecord[] = []

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line)
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? '']),
    )
    if (Number(row.ANO_ELEICAO) !== year) continue
    const position = POSITION_BY_TSE_LABEL[normalizeText(row.DS_CARGO ?? '')]
    if (!position) continue
    const tseId = nullableTseValue(row.SQ_CANDIDATO)
    const name = nullableTseValue(row.NM_CANDIDATO)
    const party = nullableTseValue(row.SG_PARTIDO)
    const state = nullableTseValue(row.SG_UF)
    if (!tseId || !name || !party || !state) continue

    const ballot = Number(row.NR_CANDIDATO)
    const date = nullableTseValue(row.DT_GERACAO)
    const time = nullableTseValue(row.HH_GERACAO)
    results.push({
      tseId,
      name,
      // Nome de urna e nome social são conceitos distintos no leiaute do TSE.
      socialName: nullableTseValue(row.NM_SOCIAL_CANDIDATO),
      party,
      state,
      position,
      ballotNumber: Number.isInteger(ballot) && ballot > 0 ? ballot : null,
      candidacyStatus: mapTseCandidacyStatus(row.DS_SITUACAO_CANDIDATURA ?? ''),
      coalitionKey: nullableTseValue(row.SQ_COLIGACAO),
      coalitionName: nullableTseValue(row.NM_COLIGACAO),
      generatedAt: date ? `${date}${time ? ` ${time}` : ''}` : null,
      replacesCandidateId: null,
    })
  }

  return results
}

export function parseTseCandidateComplementsCsv(
  csv: string,
  year: number,
): TseCandidateJudgment[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return []
  const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, ''))
  const results: TseCandidateJudgment[] = []

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line)
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? '']),
    )
    if (Number(row.ANO_ELEICAO) !== year) continue
    const tseId = nullableTseValue(row.SQ_CANDIDATO)
    if (!tseId) continue

    const judgmentLabel = nullableTseValue(row.DS_SITUACAO_JULGAMENTO)
    const detailLabel = nullableTseValue(row.DS_DETALHE_SITUACAO_CAND)
    const substitutedValue = row.ST_SUBSTITUIDO ?? ''
    const replacesCandidateId = nullableTseValue(row.SQ_SUBSTITUIDO)
    results.push({
      tseId,
      candidacyStatus: mapTseJudgmentStatus({
        judgment: judgmentLabel ?? '',
        detail: detailLabel ?? '',
        substituted: substitutedValue,
      }),
      judgmentLabel,
      detailLabel,
      substituted: normalizeText(substitutedValue) === 'S',
      replacesCandidateId,
    })
  }

  return results
}

export function joinTseCandidateJudgments(
  candidates: TseCandidateRecord[],
  judgments: TseCandidateJudgment[],
): TseCandidateRecord[] {
  const judgmentByCandidate = new Map(
    judgments.map((judgment) => [judgment.tseId, judgment]),
  )

  return candidates.map((candidate) => {
    const judgment = judgmentByCandidate.get(candidate.tseId)
    return judgment
      ? {
          ...candidate,
          candidacyStatus: judgment.candidacyStatus,
          replacesCandidateId: judgment.replacesCandidateId,
        }
      : candidate
  })
}

export function selectRunningMateForCandidate(
  candidate: TseCandidateRecord,
  records: TseCandidateRecord[],
): TseCandidateRecord | undefined {
  if (!candidate.coalitionKey) return undefined

  const coalitionRecords = [
    ...new Map(
      records
        .filter((record) => record.coalitionKey === candidate.coalitionKey)
        .map((record) => [record.tseId, record]),
    ).values(),
  ]
  const replacedIds = new Set(
    coalitionRecords
      .map((record) => record.replacesCandidateId)
      .filter((id): id is string => Boolean(id)),
  )

  // Não atribua a vice atual a uma candidatura presidencial histórica.
  if (replacedIds.has(candidate.tseId) || candidate.candidacyStatus === 'substituido') {
    return undefined
  }

  const closedStatuses = new Set<CandidacyStatus>([
    'substituido',
    'desistiu',
    'cancelado',
    'pedido_nao_conhecido',
    'cassado',
    'falecido',
    'status_nao_mapeado',
  ])
  const endpoints = coalitionRecords.filter(
    (record) =>
      record.position === Position.VICE_PRESIDENTE &&
      !replacedIds.has(record.tseId) &&
      !closedStatuses.has(record.candidacyStatus),
  )

  // Substituições de titular e vice são cadeias independentes. Para a chapa
  // atual, só o endpoint ativo e único da cadeia de vices é seguro.
  return endpoints.length === 1 ? endpoints[0] : undefined
}

async function downloadCsvFromZip(url: string, expectedName: string): Promise<string> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 120_000,
    maxContentLength: 250 * 1024 * 1024,
  })
  const archive = new AdmZip(Buffer.from(response.data))
  const entry = archive
    .getEntries()
    .find((candidate) => candidate.entryName.toLowerCase().endsWith(expectedName.toLowerCase()))
  if (!entry) throw new Error(`Arquivo ${expectedName} ausente no ZIP do TSE`)
  return entry.getData().toString('latin1')
}

export async function fetchCandidatos(
  year: number,
  state?: string,
): Promise<TseCandidateRecord[]> {
  const suffix = state?.toUpperCase() ?? 'BRASIL'
  logger.info(`[tse] Baixando candidaturas e julgamentos oficiais de ${year}`)
  const [candidatesCsv, complementsCsv] = await Promise.all([
    downloadCsvFromZip(
      candidateZipUrl(year),
      `consulta_cand_${year}_${suffix}.csv`,
    ),
    downloadCsvFromZip(
      candidateComplementZipUrl(year),
      `consulta_cand_complementar_${year}_${suffix}.csv`,
    ),
  ])

  return joinTseCandidateJudgments(
    parseTseCandidatesCsv(candidatesCsv, year),
    parseTseCandidateComplementsCsv(complementsCsv, year),
  )
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(value: string): string {
  return normalizeName(value).replace(/\s+/g, '-')
}

function effectiveSlug(candidate: Pick<Candidate, 'name' | 'party' | 'state' | 'slug'>): string {
  return candidate.slug ?? `${slugify(candidate.name)}-${slugify(candidate.party)}-${slugify(candidate.state)}`
}

function matchExistingCandidate(
  record: TseCandidateRecord,
  candidates: Candidate[],
): Candidate | undefined {
  // Never attach a positive TSE identity through fuzzy name matching. If an
  // editorial record predates the official identifier, the sync creates a
  // separate fail-closed row and the reconciliation is explicit/auditable.
  return candidates.find((candidate) => candidate.tseId === record.tseId)
}

function hasChanged(current: unknown, incoming: unknown): boolean {
  return incoming !== undefined && current !== incoming
}

export async function syncTse(year = 2026): Promise<void> {
  const records = await fetchCandidatos(year)
  const candidates = await prisma.candidate.findMany({ where: { electionYear: year } })
  const profilePositions = new Set<Position>([
    Position.PRESIDENTE,
    Position.GOVERNADOR,
    Position.SENADOR,
  ])
  const eligibleRecords = records.filter((record) => profilePositions.has(record.position))
  const verifiedAt = new Date()
  const touchedSlugs = new Set<string>()
  let created = 0
  let updated = 0

  for (const record of eligibleRecords) {
    const existing = matchExistingCandidate(record, candidates)
    const vice = record.position === Position.PRESIDENTE
      ? selectRunningMateForCandidate(record, records)
      : undefined

    if (!existing) {
      const candidate = await prisma.candidate.create({
        data: {
          tseId: record.tseId,
          name: record.name,
          socialName: record.socialName,
          party: record.party,
          state: record.state,
          position: record.position,
          ballotNumber: record.ballotNumber,
          electionYear: year,
          slug: `${slugify(record.name)}-${slugify(record.party)}-${slugify(record.state)}`,
          coalitionName: record.coalitionName,
          runningMateName: vice?.name ?? null,
          runningMateParty: vice?.party ?? null,
          runningMateSourceUrl: vice ? TSE_CANDIDATES_DATASET_URL : null,
          candidacyStatus: record.candidacyStatus,
          candidacyStatusSourceUrl: TSE_CANDIDATES_DATASET_URL,
          candidacyStatusVerifiedAt: verifiedAt,
          materialUpdatedAt: verifiedAt,
          partyHistory: [record.party],
        },
      })
      candidates.push(candidate)
      touchedSlugs.add(effectiveSlug(candidate))
      created += 1
      continue
    }

    const data: Prisma.CandidateUncheckedUpdateInput = {}
    let materialChange = false
    const assignMaterial = <K extends keyof Prisma.CandidateUncheckedUpdateInput>(
      key: K,
      value: Prisma.CandidateUncheckedUpdateInput[K],
      current: unknown,
    ) => {
      if (!hasChanged(current, value)) return
      data[key] = value
      materialChange = true
    }

    if (!existing.tseId) {
      data.tseId = record.tseId
      materialChange = true
    }
    assignMaterial('name', record.name, existing.name)
    if (record.socialName) assignMaterial('socialName', record.socialName, existing.socialName)
    assignMaterial('party', record.party, existing.party)
    assignMaterial('ballotNumber', record.ballotNumber, existing.ballotNumber)
    assignMaterial('coalitionName', record.coalitionName, existing.coalitionName)
    assignMaterial('runningMateName', vice?.name ?? null, existing.runningMateName)
    assignMaterial('runningMateParty', vice?.party ?? null, existing.runningMateParty)
    assignMaterial(
      'runningMateSourceUrl',
      vice ? TSE_CANDIDATES_DATASET_URL : null,
      existing.runningMateSourceUrl,
    )

    if (
      shouldAcceptIncomingStatus({
        currentStatus: existing.candidacyStatus,
        currentSourceUrl: existing.candidacyStatusSourceUrl,
        incomingStatus: record.candidacyStatus,
        incomingSourceUrl: TSE_CANDIDATES_DATASET_URL,
      })
    ) {
      if (record.candidacyStatus !== existing.candidacyStatus) materialChange = true
      data.candidacyStatus = record.candidacyStatus
      data.candidacyStatusSourceUrl = TSE_CANDIDATES_DATASET_URL
      data.candidacyStatusVerifiedAt = verifiedAt
    }

    if (record.party !== existing.party && !existing.partyHistory.includes(record.party)) {
      data.partyHistory = [...existing.partyHistory, record.party]
    }
    if (materialChange) data.materialUpdatedAt = verifiedAt

    const updatedCandidate = await prisma.candidate.update({
      where: { id: existing.id },
      data,
    })
    const index = candidates.findIndex((candidate) => candidate.id === existing.id)
    if (index >= 0) candidates[index] = updatedCandidate
    touchedSlugs.add(effectiveSlug(updatedCandidate))
    updated += 1
  }

  if (touchedSlugs.size > 0) {
    await invalidateApiCandidateCaches()
    await revalidateCandidatePages([...touchedSlugs])
  }

  logger.info(
    `[tse] Sincronização oficial concluída: ${created} criados, ${updated} atualizados, ${eligibleRecords.length} registros relevantes`,
  )
}

if (require.main === module) {
  syncTse()
    .catch((error) => {
      logger.error('[tse] Falha fatal', error)
      process.exitCode = 1
    })
    .finally(async () => prisma.$disconnect())
}
