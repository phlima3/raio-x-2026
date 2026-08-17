import { OfficialCandidacyStatus } from '@prisma/client'

import type { CandidacyStatus } from '../../processors/presidentialExtractor'

export type TseComplementRow = Readonly<Record<string, string | null>>

export interface ResolvedTseCandidateJudgment {
  tseId: string
  candidacyStatus: CandidacyStatus
  officialStatus: OfficialCandidacyStatus
  rawStatus: string
  substituted: boolean
  replacesCandidateId: string | null
  ambiguous: boolean
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  if (!normalized || ['#NULO', '#NULO#', '#NE', '#NE#', '-1'].includes(normalized)) {
    return null
  }
  return normalized
}

function statusEvidence(row: TseComplementRow): string[] {
  return [
    row.DS_DETALHE_SITUACAO_CAND,
    row.DS_SITUACAO_JULGAMENTO,
    row.DS_SITUACAO_CANDIDATO_TOT,
    row.DS_SITUACAO_CANDIDATO_PLEITO,
  ].flatMap((value) => clean(value) ? [clean(value)!] : [])
}

// Publicar exige candidatura registrada e não rejeitada. Logo após o prazo de
// registro a quase totalidade das candidaturas fica pendente de julgamento —
// tratá-las como não publicáveis esvaziaria o site por semanas. A regra mora
// aqui porque tanto a importação canônica quanto o complementar decidem
// visibilidade; quando estava duplicada as duas divergiram.
const PUBLISHABLE_STATUSES = new Set<OfficialCandidacyStatus>([
  OfficialCandidacyStatus.ELIGIBLE,
  OfficialCandidacyStatus.PENDING,
])

export function isPublishableStatus(status: OfficialCandidacyStatus): boolean {
  return PUBLISHABLE_STATUSES.has(status)
}

export function mapTseJudgmentStatus(row: TseComplementRow): CandidacyStatus {
  const substituted = normalizeToken(row.ST_SUBSTITUIDO ?? '') === 'S'
  const evidence = normalizeToken(statusEvidence(row).join(' '))

  if (substituted || evidence.includes('SUBSTITUID')) return 'substituido'
  if (evidence.includes('PEDIDO NAO CONHECIDO')) return 'pedido_nao_conhecido'
  if (evidence.includes('CANCELAD')) return 'cancelado'
  if (evidence.includes('CASSAD')) return 'cassado'
  if (evidence.includes('FALEC')) return 'falecido'
  if (evidence.includes('RENUNC') || evidence.includes('DESIST')) return 'desistiu'
  if (evidence.includes('INDEFERID')) return 'indeferido'
  if (evidence.includes('DEFERID')) return 'deferido'

  // INAPTO is intentionally not promoted. Without the detailed judgment it
  // cannot distinguish indeferimento, cancellation, resignation or another
  // closed outcome.
  if (/(^|\s)INAPTO($|\s)/.test(evidence)) return 'status_nao_mapeado'

  if (
    !evidence ||
    evidence.includes('AGUARDANDO JULGAMENTO') ||
    evidence.includes('PENDENTE') ||
    evidence.includes('CADASTRADO') ||
    /(^|\s)APTO($|\s)/.test(evidence)
  ) {
    return 'registro_solicitado'
  }

  return 'status_nao_mapeado'
}

function officialStatusFor(
  candidacyStatus: CandidacyStatus,
  rawStatus: string,
): OfficialCandidacyStatus {
  if (candidacyStatus === 'deferido') return OfficialCandidacyStatus.ELIGIBLE
  if (candidacyStatus === 'indeferido') return OfficialCandidacyStatus.INELIGIBLE
  if (
    candidacyStatus === 'desistiu' ||
    candidacyStatus === 'substituido' ||
    candidacyStatus === 'cancelado' ||
    candidacyStatus === 'pedido_nao_conhecido' ||
    candidacyStatus === 'cassado' ||
    candidacyStatus === 'falecido'
  ) {
    return OfficialCandidacyStatus.CANCELLED
  }
  if (candidacyStatus === 'registro_solicitado') {
    return /(^|\s)APTO($|\s)/.test(normalizeToken(rawStatus))
      ? OfficialCandidacyStatus.ELIGIBLE
      : OfficialCandidacyStatus.PENDING
  }
  return OfficialCandidacyStatus.UNKNOWN
}

function rawStatus(row: TseComplementRow): string {
  return statusEvidence(row)[0] ?? '#NE'
}

function generatedAt(row: TseComplementRow): number | null {
  const date = clean(row.DT_GERACAO)
  if (!date) return null
  const time = clean(row.HH_GERACAO) ?? '00:00:00'
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date)
  if (match) {
    const [, day, month, year] = match
    const parsed = Date.parse(`${year}-${month}-${day}T${time}Z`)
    return Number.isFinite(parsed) ? parsed : null
  }
  const parsed = Date.parse(`${date} ${time}`)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveRow(row: TseComplementRow): ResolvedTseCandidateJudgment | null {
  const tseId = clean(row.SQ_CANDIDATO)
  if (!tseId) return null
  const status = mapTseJudgmentStatus(row)
  const raw = rawStatus(row)
  return {
    tseId,
    candidacyStatus: status,
    officialStatus: officialStatusFor(status, raw),
    rawStatus: raw,
    substituted: normalizeToken(row.ST_SUBSTITUIDO ?? '') === 'S',
    replacesCandidateId: clean(row.SQ_SUBSTITUIDO),
    ambiguous: false,
  }
}

function semanticKey(judgment: ResolvedTseCandidateJudgment): string {
  return [
    judgment.candidacyStatus,
    judgment.officialStatus,
    judgment.substituted ? 'S' : 'N',
    judgment.replacesCandidateId ?? '',
  ].join('\u0000')
}

export function resolveTseCandidateJudgments(
  rows: readonly TseComplementRow[],
): Map<string, ResolvedTseCandidateJudgment> {
  const rowsByCandidate = new Map<string, TseComplementRow[]>()
  for (const row of rows) {
    const tseId = clean(row.SQ_CANDIDATO)
    if (!tseId) continue
    rowsByCandidate.set(tseId, [...(rowsByCandidate.get(tseId) ?? []), row])
  }

  const resolved = new Map<string, ResolvedTseCandidateJudgment>()
  for (const [tseId, candidateRows] of rowsByCandidate) {
    const dated = candidateRows
      .map((row) => ({ row, timestamp: generatedAt(row) }))
      .filter((entry): entry is { row: TseComplementRow; timestamp: number } =>
        entry.timestamp != null,
      )
    const finalists = dated.length > 0
      ? dated
          .filter((entry) => entry.timestamp === Math.max(...dated.map((item) => item.timestamp)))
          .map((entry) => entry.row)
      : candidateRows
    const judgments = finalists.flatMap((row) => {
      const judgment = resolveRow(row)
      return judgment ? [judgment] : []
    })
    if (judgments.length === 0) continue

    const semanticChoices = new Map(judgments.map((judgment) => [semanticKey(judgment), judgment]))
    if (semanticChoices.size > 1) {
      resolved.set(tseId, {
        tseId,
        candidacyStatus: 'status_nao_mapeado',
        officialStatus: OfficialCandidacyStatus.UNKNOWN,
        rawStatus: [...new Set(judgments.map((judgment) => judgment.rawStatus))]
          .sort()
          .join(' | '),
        substituted: false,
        replacesCandidateId: null,
        ambiguous: true,
      })
      continue
    }

    resolved.set(tseId, [...semanticChoices.values()][0])
  }

  return resolved
}
