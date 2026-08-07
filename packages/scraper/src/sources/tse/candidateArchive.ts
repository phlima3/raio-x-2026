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
  fileName: string
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

  const fileName = candidateCsvNames(files)[0]
  if (!fileName) {
    throw new TseArchiveError(
      'CANDIDATE_CSV_NOT_FOUND',
      'O ZIP TSE não contém um CSV consulta_cand',
    )
  }

  const parsed = parseTseCandidateCsv(Buffer.from(files[fileName]), options)
  return { ...parsed, fileName }
}
