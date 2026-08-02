import { parse } from 'csv-parse/sync'
import { unzipSync } from 'fflate'
import iconv from 'iconv-lite'

export interface TseTabularArchive {
  fileName: string
  encoding: 'utf8' | 'latin1'
  columns: string[]
  rows: Array<Record<string, string | null>>
}

const NULL_MARKERS = new Set(['', '#NULO#', '#NE#', '-1', '-3'])

function normalizeValue(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return NULL_MARKERS.has(text.toUpperCase()) ? null : text
}

function isSensitiveColumn(column: string): boolean {
  const normalized = column.toUpperCase()
  return normalized.includes('CPF') || normalized.includes('TITULO_ELEITORAL')
}

function decodeCsv(bytes: Buffer): { text: string; encoding: 'utf8' | 'latin1' } {
  const utf8 = bytes.toString('utf8')
  if (!utf8.includes('\uFFFD')) return { text: utf8, encoding: 'utf8' }
  return { text: iconv.decode(bytes, 'latin1'), encoding: 'latin1' }
}

function csvNames(files: Record<string, Uint8Array>): string[] {
  return Object.keys(files)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .sort((left, right) => {
      const rank = (name: string) => /brasil\.csv$/i.test(name) ? 0 : /_br\.csv$/i.test(name) ? 1 : 2
      return rank(left) - rank(right) || left.localeCompare(right)
    })
}

export function parseTseTabularArchive(archive: Buffer): TseTabularArchive {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(archive))
  } catch (cause) {
    throw new Error('O recurso tabular TSE não é um ZIP válido', { cause })
  }
  const fileName = csvNames(files)[0]
  if (!fileName) throw new Error('O ZIP tabular TSE não contém CSV')

  const decoded = decodeCsv(Buffer.from(files[fileName]))
  const parsed = parse(decoded.text, {
    bom: true,
    columns: true,
    delimiter: ';',
    quote: '"',
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Array<Record<string, unknown>>
  const columns = parsed.length > 0
    ? Object.keys(parsed[0]).filter((column) => !isSensitiveColumn(column))
    : parse(decoded.text, { bom: true, delimiter: ';', quote: '"', to_line: 1 })[0]
        .map(String)
        .filter((column: string) => !isSensitiveColumn(column))
  const rows = parsed.map((row) => Object.fromEntries(
    Object.entries(row)
      .filter(([column]) => !isSensitiveColumn(column))
      .map(([column, value]) => [column, normalizeValue(value)]),
  ))
  return { fileName, encoding: decoded.encoding, columns, rows }
}
