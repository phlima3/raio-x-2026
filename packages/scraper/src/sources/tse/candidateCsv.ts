import { parse } from 'csv-parse/sync'
import iconv from 'iconv-lite'

export type TseCsvEncoding = 'auto' | 'utf8' | 'latin1'

export type OfficialCandidacyStatus =
  | 'ELIGIBLE'
  | 'INELIGIBLE'
  | 'PENDING'
  | 'CANCELLED'
  | 'UNKNOWN'

export interface TseCandidateRecord {
  tseId: string
  electionYear: number
  electionId: string
  state: string
  position: string
  rawPosition: string
  name: string
  ballotName: string | null
  socialName: string | null
  party: string
  ballotNumber: number | null
  rawStatus: string
  rawStatusDetail: string | null
  normalizedStatus: OfficialCandidacyStatus
  isPendingJudgement: boolean
  raw: Readonly<Record<string, string | null>>
}

export interface RejectedTseCandidateRow {
  row: number
  reason: string
  raw: Readonly<Record<string, string | null>>
}

export interface TseCandidateParseResult {
  records: TseCandidateRecord[]
  rejected: RejectedTseCandidateRow[]
  encoding: Exclude<TseCsvEncoding, 'auto'>
  columns: string[]
}

export interface ParseTseCandidateCsvOptions {
  encoding?: TseCsvEncoding
  expectedState?: string
}

const NULL_MARKERS = new Set([
  '',
  '#NULO#',
  '#NE#',
  'NÃO DIVULGÁVEL',
  'NAO DIVULGAVEL',
  '-1',
  '-3',
])

const VALID_STATES = new Set([
  'BR',
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ',
  'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
])

function isSensitiveColumn(column: string): boolean {
  const normalized = column
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
  return normalized.includes('CPF') || normalized.includes('TITULO_ELEITORAL')
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return NULL_MARKERS.has(text.toUpperCase()) ? null : text
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function isIneligible(status: string): boolean {
  return status.includes('INAPTO') || status.includes('INDEFERIDO')
}

function isCancelled(status: string): boolean {
  return status.includes('CANCELADO') || status.includes('CASSADO') ||
    status.includes('RENUNCIA') || status.includes('FALECIDO')
}

function isPending(status: string): boolean {
  return status.includes('PENDENTE') || status.includes('AGUARDANDO')
}

function isEligible(status: string): boolean {
  return status === 'APTO' || status.includes('DEFERIDO')
}

/**
 * O TSE divide a situação em duas colunas: `DS_SITUACAO_CANDIDATURA` (APTO /
 * INAPTO) e `DS_DETALHE_SITUACAO_CAND`, que carrega o estado processual real
 * (DEFERIDO, AGUARDANDO JULGAMENTO, INDEFERIDO COM RECURSO, RENÚNCIA…). Nos
 * dias seguintes ao registro a coluna de detalhe é a única preenchida com
 * informação útil, então as duas são consideradas — o detalhe tem precedência
 * nos estados negativos, que são os que impedem publicação.
 */
function normalizeStatus(
  rawStatus: string,
  rawStatusDetail: string | null,
): OfficialCandidacyStatus {
  const status = normalizeToken(rawStatus)
  const detail = rawStatusDetail ? normalizeToken(rawStatusDetail) : ''

  if (isIneligible(detail) || isIneligible(status)) return 'INELIGIBLE'
  if (isCancelled(detail) || isCancelled(status)) return 'CANCELLED'
  if (isEligible(status) || isEligible(detail)) return 'ELIGIBLE'
  if (isPending(detail) || isPending(status)) return 'PENDING'
  return 'UNKNOWN'
}

function detectEncoding(input: Buffer): Exclude<TseCsvEncoding, 'auto'> {
  const utf8 = input.toString('utf8')
  return utf8.includes('\uFFFD') ? 'latin1' : 'utf8'
}

function decode(input: Buffer, requested: TseCsvEncoding): {
  text: string
  encoding: Exclude<TseCsvEncoding, 'auto'>
} {
  const encoding = requested === 'auto' ? detectEncoding(input) : requested
  return {
    text: encoding === 'latin1' ? iconv.decode(input, 'latin1') : input.toString('utf8'),
    encoding,
  }
}

function parseInteger(value: string | null): number | null {
  if (value == null || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function parseTseCandidateCsv(
  input: Buffer,
  options: ParseTseCandidateCsvOptions = {},
): TseCandidateParseResult {
  const { text, encoding } = decode(input, options.encoding ?? 'auto')
  const rows = parse(text, {
    bom: true,
    columns: true,
    delimiter: ';',
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, unknown>>

  const columns = rows[0] ? Object.keys(rows[0]).filter((column) => !isSensitiveColumn(column)) : []
  const records: TseCandidateRecord[] = []
  const rejected: RejectedTseCandidateRow[] = []

  rows.forEach((row, index) => {
    const raw = Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => !isSensitiveColumn(key))
        .map(([key, value]) => [key, normalizeText(value)]),
    )
    const get = (column: string): string | null => raw[column] ?? null

    const electionYear = parseInteger(get('ANO_ELEICAO'))
    const tseId = get('SQ_CANDIDATO')
    const electionId = get('CD_ELEICAO')
    const state = get('SG_UF')?.toUpperCase() ?? null
    const rawPosition = get('DS_CARGO')
    const name = get('NM_CANDIDATO')
    const party = get('SG_PARTIDO')
    const rawStatus = get('DS_SITUACAO_CANDIDATURA')
    const rawStatusDetail = get('DS_DETALHE_SITUACAO_CAND') ??
      get('DS_DETALHE_SITUACAO_CANDIDATURA')

    if (
      electionYear == null || !tseId || !electionId || !state ||
      !VALID_STATES.has(state) || !rawPosition || !name || !party || !rawStatus
    ) {
      const reason =
        electionYear == null ? 'ANO_ELEICAO inválido' :
        !tseId ? 'SQ_CANDIDATO ausente' :
        !electionId ? 'CD_ELEICAO ausente' :
        !state || !VALID_STATES.has(state) ? 'SG_UF inválida' :
        !rawPosition ? 'DS_CARGO ausente' :
        !name ? 'NM_CANDIDATO ausente' :
        !party ? 'SG_PARTIDO ausente' :
        'DS_SITUACAO_CANDIDATURA ausente'
      rejected.push({ row: index + 2, reason, raw })
      return
    }

    if (options.expectedState && state !== options.expectedState.toUpperCase()) {
      rejected.push({
        row: index + 2,
        reason: `SG_UF divergente de ${options.expectedState.toUpperCase()}`,
        raw,
      })
      return
    }

    records.push({
      tseId,
      electionYear,
      electionId,
      state,
      position: normalizeToken(rawPosition),
      rawPosition,
      name,
      ballotName: get('NM_URNA_CANDIDATO'),
      socialName: get('NM_SOCIAL_CANDIDATO'),
      party,
      ballotNumber: parseInteger(get('NR_CANDIDATO')),
      rawStatus,
      rawStatusDetail,
      normalizedStatus: normalizeStatus(rawStatus, rawStatusDetail),
      isPendingJudgement: isPending(normalizeToken(rawStatusDetail ?? rawStatus)),
      raw,
    })
  })

  return { records, rejected, encoding, columns }
}
