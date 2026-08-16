import { unzipSync } from 'fflate'

import {
  parseTseCandidateCsv,
  type ParseTseCandidateCsvOptions,
  type TseCandidateParseResult,
} from './candidateCsv'

export type TseArchiveErrorCode = 'INVALID_ZIP' | 'CANDIDATE_CSV_NOT_FOUND'

export class TseArchiveError extends Error {
  constructor(
    readonly code: TseArchiveErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'TseArchiveError'
  }
}

export interface TseCandidateArchiveResult extends TseCandidateParseResult {
  /** Primeiro CSV lido, na ordem de preferência. Mantido para compatibilidade. */
  fileName: string
  /** Todos os CSVs de candidatura encontrados no ZIP, na ordem em que foram lidos. */
  fileNames: string[]
  /** Linhas descartadas por repetirem um SQ_CANDIDATO já visto em outro arquivo. */
  duplicates: number
}

function candidateCsvNames(files: Record<string, Uint8Array>): string[] {
  return Object.keys(files)
    .filter((name) => /(?:^|\/)consulta[_-]?cand.*\.csv$/i.test(name))
    .sort((left, right) => {
      const leftBrasil = /brasil/i.test(left) ? 0 : /_br\./i.test(left) ? 1 : 2
      const rightBrasil = /brasil/i.test(right) ? 0 : /_br\./i.test(right) ? 1 : 2
      return leftBrasil - rightBrasil || left.localeCompare(right)
    })
}

/**
 * O TSE não usa um layout único: dependendo do pleito o ZIP traz um CSV
 * nacional consolidado, um CSV por UF, um CSV `_BR` só com a chapa
 * presidencial, ou uma combinação disso. Ler um arquivo só descartaria
 * silenciosamente 27 estados — ou, no layout oposto, a própria disputa
 * presidencial. Todos os CSVs `consulta_cand` são lidos e concatenados;
 * `SQ_CANDIDATO` é único por candidatura, então a deduplicação cobre o caso
 * em que o consolidado nacional e os arquivos por UF coexistem.
 */
export function parseTseCandidateArchive(
  archive: Buffer,
  options: ParseTseCandidateCsvOptions = {},
): TseCandidateArchiveResult {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(archive))
  } catch (cause) {
    throw new TseArchiveError('INVALID_ZIP', 'O recurso TSE não é um ZIP válido', { cause })
  }

  const fileNames = candidateCsvNames(files)
  if (fileNames.length === 0) {
    throw new TseArchiveError(
      'CANDIDATE_CSV_NOT_FOUND',
      'O ZIP TSE não contém um CSV consulta_cand',
    )
  }

  const records: TseCandidateParseResult['records'] = []
  const rejected: TseCandidateParseResult['rejected'] = []
  const columns = new Set<string>()
  const seen = new Set<string>()
  let duplicates = 0
  let encoding: TseCandidateParseResult['encoding'] | null = null

  for (const name of fileNames) {
    const parsed = parseTseCandidateCsv(Buffer.from(files[name]), options)
    encoding ??= parsed.encoding
    parsed.columns.forEach((column) => columns.add(column))
    rejected.push(...parsed.rejected)
    for (const record of parsed.records) {
      if (seen.has(record.tseId)) {
        duplicates++
        continue
      }
      seen.add(record.tseId)
      records.push(record)
    }
  }

  return {
    records,
    rejected,
    encoding: encoding ?? 'utf8',
    columns: [...columns],
    fileName: fileNames[0],
    fileNames,
    duplicates,
  }
}
